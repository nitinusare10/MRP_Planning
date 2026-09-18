import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// This sandbox's pre-installed Chromium revision doesn't always match the
// one this @playwright/test version expects, so point at it explicitly
// instead of running `playwright install` (see repo environment notes).
const localChromePath = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: path.join(__dirname, "tests/e2e"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NODE_ENV: "production" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: localChromePath } },
    },
  ],
});
