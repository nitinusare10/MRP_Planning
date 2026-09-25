import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";

// Playwright's own TS transform can't load the generated Prisma client
// (it uses `import.meta`, which needs Vite's/Next's ESM-aware loader) — so
// this file talks to Postgres directly via `pg` for its small amount of
// fixture setup instead of importing @/lib/db.

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const VIEWER_EMAIL = `e2e-viewer-${Date.now()}@doparenergy.local`;
const VIEWER_PASSWORD = "ViewerOnlyPassword123!";

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

test.beforeAll(async () => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD must be set and seeded before running e2e tests.",
    );
  }
  const passwordHash = await hashPassword(VIEWER_PASSWORD);
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'VIEWER', true, NOW(), NOW())`,
      [randomUUID(), VIEWER_EMAIL, "E2E Viewer", passwordHash],
    );
    // Deterministic starting point regardless of what earlier test runs did.
    await db.query(`DELETE FROM "ZohoConnection"`);
  });
});

test.afterAll(async () => {
  await withDb((db) => db.query(`DELETE FROM "User" WHERE email = $1`, [VIEWER_EMAIL]));
});

test("ADMIN sees connection status and the connect form when not connected", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/zoho");

  await expect(page.getByRole("heading", { name: "Zoho Inventory Integration" })).toBeVisible();
  await expect(page.getByText("Not connected")).toBeVisible();
  await expect(page.getByLabel("Zoho Organization ID")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect to Zoho" })).toBeVisible();
  // Not connected yet, so sync controls are gated off with a guidance message.
  await expect(page.getByText("Connect to Zoho before running a sync.")).toBeVisible();
});

test("attempting to connect without ZOHO_CLIENT_ID etc. configured fails gracefully, not with a crash", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/zoho");

  await expect(page.getByText(/Zoho OAuth is not configured yet/i)).toBeVisible();

  await page.getByLabel("Zoho Organization ID").fill("60012345678");
  await page.getByRole("button", { name: "Connect to Zoho" }).click();

  await expect(page.getByText(/not configured/i)).toBeVisible();
  // Still on /zoho — no crash, no navigation to Zoho (there's nothing to navigate to).
  await expect(page).toHaveURL(/\/zoho/);
});

test("VIEWER can see status but not manage the connection or trigger a sync", async ({ page }) => {
  await login(page, VIEWER_EMAIL, VIEWER_PASSWORD);
  await page.goto("/zoho");

  await expect(page.getByRole("heading", { name: "Zoho Inventory Integration" })).toBeVisible();
  await expect(page.getByLabel("Zoho Organization ID")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect to Zoho" })).toHaveCount(0);
  await expect(page.getByText("Only Admins can connect or disconnect Zoho.")).toBeVisible();
  await expect(page.getByText("Only Admins and Planners can trigger a sync.")).toBeVisible();
});

test("unauthenticated visitors are redirected away from /zoho", async ({ page }) => {
  await page.goto("/zoho");
  await expect(page).toHaveURL(/\/login/);
});
