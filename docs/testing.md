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

**Ringba full API import (cost control).** The defining guarantee — *importing recordings must not auto-spend on OpenAI* — is pinned by tests: `src/server/integration-ingest.test.ts` asserts a `ringba_api` ingest enqueues **zero** AI jobs by default (and that the `enqueueAiJobs: true` override re-enables it); `src/server/ringba-import.test.ts` proves the hard `maxRecords` cap (2000) is enforced server-side even when a larger value is requested, that ingest is called with `enqueueAiJobs: false`, recording-only vs. all-calls filtering, pagination limits, and that a Ringba HTTP failure records an integration event + marks the batch `failed`; `src/server/analyze-selection.test.ts` proves the gate queues transcription only for calls with a recording and no transcript, analysis only for calls with a transcript, enforces the batch cap, and skips calls outside the org (`not_in_org`); `src/lib/integration-config.test.ts` proves the API token is never present in the public config. Route-level auth/org-scoping/cap behavior lives in `tests/api/ringba-import.test.ts` and `tests/api/calls-analyze-selected.test.ts`, and `tests/api/settings-integrations.test.ts` covers the test-connection action.

> Browser flows are covered by an automated Playwright suite — see [Browser e2e](#browser-e2e-reviewer-workflow) below.

## DB-level tests (`npm run test:db`)

The default Vitest run mocks the Supabase client, so it proves *app-side* `.eq("organization_id", …)` discipline but **not** the database's own Row-Level Security or the SQL-level concurrency of the Stripe recharge RPC. A separate suite under `tests/db/**` exercises real Postgres:

- `tests/db/rls-tenant-isolation.test.ts` — seeds two orgs with members across every role (owner/admin/reviewer/analyst/billing) plus calls, flags, review notes, billing, integrations, an `ai_jobs` row, and a `processed_stripe_events` row, then asserts RLS behaviour as `anon` / `authenticated` (per `auth.uid()`) / `service_role`: cross-org reads and writes are denied, role-scoped writes are enforced, `ai_jobs` and `processed_stripe_events` are invisible to `anon`/`authenticated` (service-role-only deny-all), and `service_role` bypasses RLS (which is *why* admin-client paths must filter `organization_id`).
- `tests/db/stripe-recharge.test.ts` — drives `apply_stripe_recharge_event` against real Postgres: duplicate event id → applied once then no-op (one ledger row), concurrent same id → exactly one credit, concurrent distinct ids → serialized with no lost update, billing-account/organization mismatch → clean failure with no partial state, and EXECUTE granted only to `service_role`.
- `tests/db/ringba-import-batches.test.ts` — exercises the `ringba_import_batches` table (migration `0015`): default counters, the `status` / `import_behavior` / `max_records` CHECK constraints, and RLS — a member reads only their own org's batches and a reviewer cannot insert (owner/admin only).

These are **excluded from `npm test` and the release gate** (`vitest.config.ts` excludes `tests/db/**`) because the `verify` job has no database. They run in a **dedicated `db-tests` CI job** (`.github/workflows/ci.yml`) that boots the Supabase CLI stack (`supabase start`, which applies all migrations) and runs `npm run test:db`. Run them locally the same way:

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

An automated **Playwright** suite (`tests/e2e/`, `playwright.config.ts`) drives the reviewer workflow in a real browser against the **local** Supabase stack — never production. Run it:

```bash
supabase start        # local Postgres + auth on :54321 (one-time per session)
npm run test:e2e      # node tests/e2e/setup-env.mjs && playwright test
```

How it works:

- **`setup-env.mjs`** (runs first) derives Supabase creds from the *running* local stack (`supabase status -o env`), **asserts the host is local**, and writes a gitignored `.env.development.local`. In dev mode `astro.config.ts` merges this over `.env` (Vite `loadEnv`), so the prod `.env` is untouched.
- **`playwright.config.ts`** starts the app fresh (`npm run dev`, `reuseExistingServer: false` so a stray prod-pointed server is never reused) and runs `global-setup.ts`, which seeds via `seed.mjs`.
- **`seed.mjs`** refuses non-local DB hosts, then seeds an `owner` + a true `reviewer` (the primary login), an org, and a call with transcript, an open flag, and a note (no recording → graceful fallback).
- **`auth.setup.ts`** logs in as the seeded reviewer and saves `storageState`. This is the prod-safety gate: the reviewer exists **only** locally, so a successful login proves the app is wired to local Supabase — if it were pointed at prod, login fails and no spec runs. Every spec also asserts no request ever hits the production Supabase host.
- **`reviewer-workflow.spec.ts`** covers: call list → call detail (transcript, flag, note, graceful no-recording fallback) → transcript search → `/` focus shortcut → `?t=`/`?flag=` deep links → resolve flag → add/delete note.

Notes on robustness: the login and note/search inputs are hydrated React (controlled) islands, so the specs type with `pressSequentially` and retry until state commits; the flags/notes rail is rendered twice for responsive layout, so locators are scoped to the visible copy (`.filter({ visible: true })`).

e2e is intentionally **not** part of `npm test` / `ci:verify` (no browser/app server in the `verify` job). It runs in CI via the manually-triggered `e2e` workflow (`.github/workflows/e2e.yml`). The original Phase 6 run found and fixed two real bugs (see `git log`): the browser Supabase client ran unauthenticated (localStorage vs. the cookie session) and the app-shell nav had an SSR/CSR hydration mismatch — both now covered by unit regression tests (`src/lib/supabase/browser-client.test.ts`, `src/components/app-shell/AppShell.test.tsx`).
