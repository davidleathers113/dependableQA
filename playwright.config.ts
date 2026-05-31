import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the reviewer workflow. Runs against the LOCAL Supabase stack
 * only (see tests/e2e/setup-env.mjs, which the `test:e2e` script runs first to
 * write a local-only .env.development.local). The dev server is always started
 * fresh (reuseExistingServer: false) so a stray prod-pointed server can't be
 * reused. Excluded from `npm test` / `ci:verify` (no browser/app there).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Shared seeded data + serial flows on one call → run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: "**/*.setup.ts" },
    {
      name: "chromium",
      testMatch: "**/reviewer-workflow.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/reviewer.json" },
    },
    {
      name: "integrations",
      testMatch: "**/integrations.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/owner.json" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321/login",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
