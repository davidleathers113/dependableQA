import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    // tests/db/** are DB-level tests that require a local Postgres (see
    // vitest.db.config.ts / `npm run test:db`); keep them out of the default run.
    exclude: [...configDefaults.exclude, "**/.netlify/**", "tests/db/**"],
  },
});
