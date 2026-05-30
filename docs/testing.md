---
title: Testing
owner: Engineering
last-reviewed: 2026-05-29
---

# Testing

The project uses **Vitest** in the `node` environment (`vitest.config.ts`), with mocks cleared and restored between tests. `.netlify/**` is excluded from the run.

## Commands

```bash
npm test               # vitest run (one-shot)
npm run test:watch     # vitest (watch mode)
npx vitest run src/server/ai-jobs.test.ts   # one file
npx vitest run -t "name fragment"           # one test by name
```

Tests are part of the [release gate](operations.md#the-release-gate): `npm run ci:verify` runs them before `astro check && astro build`.

## Where tests live

Two conventions coexist; follow the matching one when adding coverage:

- **Colocated** next to the unit under test — e.g. `src/server/ai-jobs.test.ts`, `src/middleware.test.ts`, `src/lib/stripe/metadata.test.ts`. Use for pure logic and server modules.
- **`tests/`** tree — `tests/api/` (route behavior), `tests/netlify/` (function handlers), `tests/workflows/` (end-to-end flows like import → AI → review). Use for cross-module and HTTP-surface behavior.

## What to test

Existing coverage targets the risk areas: auth/session resolution, Supabase config fallback, import dispatch, provider ingest + webhook auth, the AI job queue, call-review actions, Stripe webhook handling, and the Zod request schemas in `src/lib/call-review-api-schemas.ts`. New server modules and API routes should ship with tests in the same style.

> Manual browser QA has been done ad hoc in the past (against local `netlify dev`). There is no automated browser/e2e suite; treat manual passes as point-in-time checks, not regression coverage.

## DB-level tests (`npm run test:db`)

The default Vitest run mocks the Supabase client, so it proves *app-side* `.eq("organization_id", …)` discipline but **not** the database's own Row-Level Security or the SQL-level concurrency of the Stripe recharge RPC. A separate suite under `tests/db/**` exercises real Postgres:

- `tests/db/rls-tenant-isolation.test.ts` — seeds two orgs with members across every role (owner/admin/reviewer/analyst/billing) plus calls, flags, review notes, billing, integrations, an `ai_jobs` row, and a `processed_stripe_events` row, then asserts RLS behaviour as `anon` / `authenticated` (per `auth.uid()`) / `service_role`: cross-org reads and writes are denied, role-scoped writes are enforced, `ai_jobs` and `processed_stripe_events` are invisible to `anon`/`authenticated` (service-role-only deny-all), and `service_role` bypasses RLS (which is *why* admin-client paths must filter `organization_id`).
- `tests/db/stripe-recharge.test.ts` — drives `apply_stripe_recharge_event` against real Postgres: duplicate event id → applied once then no-op (one ledger row), concurrent same id → exactly one credit, concurrent distinct ids → serialized with no lost update, billing-account/organization mismatch → clean failure with no partial state, and EXECUTE granted only to `service_role`.

These are **excluded from `npm test` and the release gate** (`vitest.config.ts` excludes `tests/db/**`) because CI has no Postgres. Run them on demand:

```bash
supabase start            # one-time per session; boots local Postgres on :54322
npm run test:db           # vitest run --config vitest.db.config.ts
```

Prerequisites and safety:

- **Docker + Supabase CLI** (`supabase start`). The stack applies all migrations in `supabase/migrations`, so the local schema matches production.
- The harness (`tests/db/db-harness.ts`) connects to `TEST_DATABASE_URL` → `SUPABASE_DB_URL` → the local default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, and **refuses any non-local host** (it truncates tables). When no local database is reachable it **skips** rather than fails, so a developer without Docker is never blocked.
- Each test runs in a rolled-back transaction acting as the target role via `set local role` + `request.jwt.claims`; fixtures are seeded once per file and truncated afterwards.
- Known local-image quirk: invoking `apply_stripe_recharge_event` as a role lacking EXECUTE segfaults the Supabase Postgres 17 image on the permission-denied path. The grant tests therefore assert the EXECUTE privilege directly (`has_function_privilege`) — the exact thing the migration controls — instead of invoking it as `anon`/`authenticated`. This path is never reached in production, where only the service-role client calls the function.

## Browser e2e (reviewer workflow)

Phase 6 verifies the reviewer workflow in a real browser against the **local** Supabase stack (never production), driven via the Playwright MCP. Setup:

1. **Local Supabase + app, wired locally.** `supabase start`, then create a gitignored `.env.development.local` pointing at the local stack (`SUPABASE_URL=http://127.0.0.1:54321` + the local `ANON_KEY`/`SERVICE_ROLE_KEY` from `supabase status -o env`, plus `APP_URL`). In dev mode `astro.config.ts` merges these over `.env` via Vite's `loadEnv`, so the prod `.env` is untouched. Run `npm run dev` (Astro on `:4321`; the reviewer workflow is SSR + `/api/**`, so the Netlify functions aren't needed).
2. **Prod-safety gate (do this before any browser interaction):** confirm the running app targets `127.0.0.1` — e.g. authenticate the seeded local-only user and confirm no production Supabase host appears in served JS or network traffic. Never run e2e against production.
3. **Seed:** `npm run e2e:seed` (`tests/e2e/seed.mjs`) — refuses non-local hosts, then truncates and seeds a confirmed reviewer user (email/password), an org + owner membership, and one call with a transcript, an open flag, and a review note (no recording → exercises the graceful fallback). It prints the login creds, ids, and the call-detail URLs (incl. `?t=` / `?flag=` deep links).
4. **Drive** the flows via the Playwright MCP: login → call list → call detail → recording fallback → transcript-segment seek → transcript search/highlight → flag resolve → note add/delete → `?t=`/`?flag=` deep links → mobile tabs / keyboard shortcuts.

e2e is intentionally **not** part of `npm test` / `ci:verify` (no browser or app server in CI). The Phase 6 run found and fixed two real bugs (see `git log`): the browser Supabase client ran unauthenticated (localStorage vs. the cookie session) and the app-shell nav had an SSR/CSR hydration mismatch — both now covered by unit regression tests (`src/lib/supabase/browser-client.test.ts`, `src/components/app-shell/AppShell.test.tsx`).
