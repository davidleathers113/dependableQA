# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DependableQA is a multi-tenant SaaS "Call Review Workspace" for QA-reviewing call-center calls: ingest calls (CSV upload, Ringba webhook/pixel, or scheduled Ringba API sync), transcribe + AI-analyze them via OpenAI, and let reviewers flag, annotate, and disposition them. It began as the Netlify `astro-supabase-starter` (the `package.json` name is still `astro-supabase-starter`) but is now a distinct product. Stack: **Astro 5 SSR + React 19 islands + Supabase (Postgres 17, RLS, private storage) + Tailwind v4 + Netlify functions + OpenAI + Stripe**.

Documentation lives in [`docs/`](docs/README.md): [architecture](docs/architecture.md), [data model](docs/data-model.md), [AI pipeline](docs/ai-pipeline.md), [integrations](docs/integrations.md), [operations](docs/operations.md), [environment](docs/environment.md), [testing](docs/testing.md), [ADRs](docs/decisions/), and the [product PRD/spec](docs/product/). The most current readiness assessment with known blockers (billing idempotency, dispatch tenant-isolation hardening) is [`docs/status-2026-05-29.md`](docs/status-2026-05-29.md) (which supersedes the historical [`docs/status-2026-04-13.md`](docs/status-2026-04-13.md)).

## Commands

- **Local dev (preferred):** `netlify dev --target-port 4321` → serves on `localhost:8888` with function emulation. Plain `npm run dev` (Astro on `:4321`) works for UI but not Netlify functions.
- **Build:** `npm run build` (= `astro check && astro build` — type errors fail the build).
- **Test:** `npm test` (`vitest run`), `npm run test:watch`. Single file: `npx vitest run src/server/ai-jobs.test.ts`. Single test: `npx vitest run -t "name fragment"`.
- **Release gate:** `npm run ci:verify` = `check:env-example` + `check:migrations` + `test` + `build`. This is also the Netlify build command and the GitHub Actions CI job — run it before claiming work is done.
- `npm run check:env-example` — fails if a required key (see `scripts/check-env-example.mjs`) is missing from `.env-example`.
- `npm run check:migrations` — fails unless `supabase/migrations` are numerically contiguous (`0001_…` → `0008_…`).

## Hard project rules

- **NO regex, anywhere** (no `new RegExp`, `/pattern/`, `.match/.test/.exec/.replace` with patterns) — this is enforced project-wide to avoid ReDoS. Use string methods (`includes`/`startsWith`/`indexOf`/`substring`), the `URL` constructor, and **Zod** for all validation. The codebase already follows this; match it.
- **Migrations are the source of truth.** Never apply schema-only changes in the Supabase UI. Add a new numbered SQL file in `supabase/migrations`, apply it via the Supabase CLI/MCP, then regenerate `supabase/types.ts` (the generated `Database` type that the whole app is typed against).
- Secrets come from env only; `.env`/`.env.*` are gitignored. When you add a required runtime key, also add it to `.env-example` or `ci:verify` fails.

## Architecture

**Full reference: [`docs/architecture.md`](docs/architecture.md).** The rest of `docs/` ([data-model](docs/data-model.md), [ai-pipeline](docs/ai-pipeline.md), [integrations](docs/integrations.md), [operations](docs/operations.md), [environment](docs/environment.md)) is the canonical deep documentation — prefer reading and updating it over duplicating here. Quick orientation:

**Layered, with a strict server/client split.** Anything touching the service-role key or OpenAI/Stripe SDKs lives in `src/server/**` or `netlify/functions/**` and must never be imported into a browser island.

- `src/middleware.ts` hydrates request auth and guards `/app/**`. Pages call `requireAppSession(Astro)`; API routes (`prerender = false`) call `requireApiSession(context)`. Both resolve `{ user, organization }`.
- `src/features/**` — React 19 island feature modules. `src/lib/app-data.ts` is the central data-access layer + domain types. `src/server/**` holds server-only logic (AI queue, transcribe/analyze, import dispatch, integration ingest, Ringba sync).
- **Three Supabase clients** (`src/lib/supabase/`): `browser-client` / `server-client` (anon, RLS-enforced) and `admin-client` (`getAdminSupabase()`, service-role, **bypasses RLS**). In admin-client paths, tenant isolation depends on always filtering `.eq("organization_id", session.organization.id)` — never trust a body-supplied `organizationId`. `config.ts` accepts `SUPABASE_DATABASE_URL` as a fallback for `SUPABASE_URL`. See [ADR 0002](docs/decisions/0002-three-supabase-clients-and-tenant-isolation.md).
- **Netlify functions** (`netlify/functions/**`): scheduled `ai-dispatch-scheduled` (2 min) and `ringba-api-sync-scheduled` (5 min); protected `ai-dispatch` / `integration-ingest` / `stripe-webhook` authenticate via shared-secret header (timing-safe compare in `src/server/netlify-request.ts`) or provider signature. (CSV import dispatch is the session-guarded API route `/api/imports/dispatch` calling `src/server/import-dispatch.ts` directly — there is no `import-dispatch` Netlify function.) Details + header names: [docs/operations.md](docs/operations.md).
- **AI pipeline:** `runAiJobs` drains the `ai_jobs` queue (transcription → analysis), deduped by key with an analysis version derived from `OPENAI_ANALYSIS_PROMPT_VERSION:OPENAI_ANALYSIS_SCHEMA_VERSION`; analysis returns Zod-validated structured output. Details: [docs/ai-pipeline.md](docs/ai-pipeline.md).

## Testing conventions

Vitest, `node` environment, mocks cleared/restored between tests. Tests live **both** colocated next to source (`src/server/ai-jobs.test.ts`, `src/middleware.test.ts`) **and** under `tests/` (`tests/api/`, `tests/netlify/`, `tests/workflows/`). When adding a server module or API route, add coverage in the matching style. `.netlify/**` is excluded from the test run.
