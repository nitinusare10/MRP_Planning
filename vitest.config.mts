import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const rootDir = import.meta.dirname;

loadEnv({ path: path.resolve(rootDir, ".env.test") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: false,
    // Integration tests share one Postgres database and use real triggers/
    // constraints — run them serially to avoid unique-key collisions across
    // parallel workers.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
