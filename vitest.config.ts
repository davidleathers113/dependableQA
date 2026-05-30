import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    // tests/db/** are DB-level tests that require a local Postgres (see
    // vitest.db.config.ts / `npm run test:db`); tests/e2e/** are Playwright
    // specs run by `npm run test:e2e`. Keep both out of the default Vitest run.
    exclude: [...configDefaults.exclude, "**/.netlify/**", "tests/db/**", "tests/e2e/**"],
  },
});
