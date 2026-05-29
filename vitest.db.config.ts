import { defineConfig } from "vitest/config";

// DB-level tests run against a *local* Postgres (Supabase CLI stack), never
// production. They are intentionally excluded from the default `npm test`
// (see vitest.config.ts) and the release gate, and are run on demand with
// `npm run test:db`. The harness (tests/db/db-harness.ts) refuses to connect
// to any non-local host and skips entirely when no local database is reachable.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // RLS/concurrency tests share seeded fixtures and a single database; run
    // the files serially to keep the shared state deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
