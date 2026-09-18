/**
 * Development-only seed: creates a single ADMIN user so the app has
 * somewhere to log in. Nothing else is seeded — no fake items, BOMs,
 * vendors, or manufacturing data (see Phase 0 scope in docs/architecture.md).
 *
 * Required env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
 * Refuses to run against anything it doesn't recognize as non-production.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the development seed with NODE_ENV=production.");
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Dopar MRP Admin";

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set (e.g. in .env) before seeding.",
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.upsert({
      where: { email },
      update: {}, // never overwrite an existing admin's password on re-seed
      create: {
        email,
        name,
        passwordHash,
        role: "ADMIN",
        active: true,
      },
    });

    console.log(`Seeded admin user: ${admin.email} (${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
