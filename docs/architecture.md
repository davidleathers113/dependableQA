---
title: Architecture
owner: Engineering
last-reviewed: 2026-05-27
---

# Architecture

DependableQA is a multi-tenant call-QA operations system. Every imported call is traceable, every AI decision is reviewable, every manual override is auditable, and every operational view is filterable. The design follows from one rule: **preserve source truth, layer controlled QA decisions on top of it.**

## Stack

| Concern | Choice |
|---|---|
| Routing, SSR, app shell | Astro 5 |
| Interactive surfaces | React 19 islands |
| Styling | Tailwind v4 (via the `@tailwindcss/vite` plugin) |
| Auth, Postgres, Storage | Supabase (Postgres 17) |
| AI | OpenAI (transcription + analysis) |
| Billing | Stripe (subscription + wallet/recharge) |
| Hosting + serverless | Netlify (adapter + functions) |
| Validation | Zod (see [ADR 0003](decisions/0003-no-regex-zod-only-policy.md)) |
| Tables / data orchestration | TanStack Table, Query, Virtual |
| Forms | react-hook-form |
| Audio | wavesurfer.js |

This is **not a SPA.** Astro handles route-level SSR and auth gating; React islands hydrate only the high-interactivity sections (tables, drawers, the call-review workspace). That gives fast first paint, controlled hydration, and good Netlify ergonomics. See [ADR 0001](decisions/0001-astro-ssr-with-react-islands.md).

## Three data layers

The schema deliberately separates three layers; this separation is the core architectural commitment.

1. **Source layer** — raw platform truth exactly as it arrived from Ringba / TrackDrive / Retreaver / a CSV import. Immutable.
2. **Normalized layer** — the canonical `calls` record plus mapped entities (campaign, publisher, duration, phone, timestamps).
3. **QA layer** — disposition, flags, notes, review state, overrides, escalation, audit history. Mutable.

Bad imports and reclassification are managed by layering controlled overrides above preserved source data, never by editing the original row. See [`docs/data-model.md`](data-model.md) for the table-by-table breakdown.

## Code layout

Anything that touches the service-role key or the OpenAI/Stripe SDKs lives in `src/server/**` or `netlify/functions/**` and must never be imported into a browser island.

| Path | Responsibility |
|---|---|
| `src/middleware.ts` | Runs on every request; hydrates `context.locals.{supabase,session,user}`; redirects unauthenticated `/app/**` to `/login`. |
| `src/pages/app/**` | Authenticated Astro pages. Each calls `requireAppSession(Astro)` to resolve user + active organization. Server-render first, then hand off to islands. |
| `src/pages/api/**` | SSR API endpoints (`export const prerender = false`). Each calls `requireApiSession(context)` → `{ user, organization }` or `null` (401). |
| `src/features/**` | React island feature modules: `calls`, `call-review`, `imports`, `integrations`, `settings`, `ai`, `billing`, `overview`, `reports`, `updates`. |
| `src/lib/app-data.ts` | Central data-access layer and shared domain types (re-exported via `src/types/domain.ts`); `insertAuditLog` lives here. |
| `src/server/**` | Server-only business logic: `ai-jobs`, `transcribe-call`, `analyze-call`, `import-dispatch`, `integration-ingest`, `ringba-api-sync`, `ringba-calllogs`. |
| `src/lib/**` | Shared libs: Supabase clients, OpenAI client, Stripe helpers, auth/session, integration config, Zod schemas. |
| `netlify/functions/**` | Background workers and webhooks. |
| `supabase/migrations/**` | Numbered SQL migrations — the schema source of truth. |

## Request / auth flow

1. `src/middleware.ts` builds a per-request Supabase server client from cookies and attaches the session to `context.locals`. `/app/**` without a session redirects to `/login`.
2. **Pages** call `requireAppSession(Astro)` (`src/lib/auth/require-app-session.ts`): resolves the session, then the user's **active organization** (cookie-backed, falling back to a default membership). No membership → redirect to `/onboarding`.
3. **API routes** call `requireApiSession(context)` (`src/lib/auth/request-session.ts`), which wraps `resolveRequestAppSession` and returns `{ user, organization }` or `null`.

Both paths return the active organization, so every downstream query can scope by `organization_id`.

## The three Supabase clients

Choosing the wrong client is the most common source of bugs. See [ADR 0002](decisions/0002-three-supabase-clients-and-tenant-isolation.md).

| Client | Key | RLS | Used by |
|---|---|---|---|
| `browser-client.ts` | anon | enforced | Browser islands |
| `server-client.ts` | anon + cookie session | enforced (as the user) | Middleware, pages, user-scoped API reads |
| `admin-client.ts` (`getAdminSupabase()`) | service role | **bypassed** | `src/server/**`, Netlify functions, privileged writes |

Because admin-client paths bypass RLS, **tenant isolation in those paths depends on always filtering `.eq("organization_id", session.organization.id)` in application code** — and never trusting an `organizationId` taken from a request body. RLS is the backstop; application discipline is the primary control.

`src/lib/supabase/config.ts` resolves config and accepts `SUPABASE_DATABASE_URL` (Netlify's Supabase-integration variable) as a fallback for `SUPABASE_URL`. Mirror this fallback in any new Supabase wiring.

## Netlify worker model

Background work runs as Netlify functions, not in request handlers. See [`docs/operations.md`](operations.md) for schedules and [`docs/integrations.md`](integrations.md) for the ingest paths.

- **Scheduled** (configured in `netlify.toml`): `ai-dispatch-scheduled` (every 2 min, drains the AI job queue) and `ringba-api-sync-scheduled` (every 5 min, polls Ringba call logs).
- **Protected / webhook**: `ai-dispatch`, `integration-ingest`, `stripe-webhook`. Each authenticates with a shared-secret header (timing-safe compare via `src/server/netlify-request.ts`) or a provider signature. (CSV import dispatch is the session-guarded API route `/api/imports/dispatch`, which calls `src/server/import-dispatch.ts` directly — the standalone `import-dispatch` Netlify function was removed in Phase 1.)

## Roles & permissions

Org membership carries a role (`owner`, `admin`, `reviewer`, `analyst`, `billing`). Permissions are enforced in RLS, server loaders, and action handlers — not by UI hiding alone. Roles broadly map to: owners/admins manage org/billing/integrations/team; reviewers review calls and override dispositions; analysts get read + reporting/export; billing is billing-scoped.

## Core data flows

- **CSV import** — upload to Storage → create `import_batches` row → background dispatch parses/validates headers → rejected rows to `import_row_errors`, accepted rows normalized into `calls` with a source snapshot → AI jobs queued → batch marked completed/partial.
- **Live integration** — provider posts webhook/pixel → endpoint validates signature/config → source payload stored → call normalized → AI pipeline runs → flags/disposition emitted.
- **Review** — reviewer inspects transcript/summary/flags → confirms or overrides disposition, resolves flags → `call_reviews` + `disposition_overrides` written → `calls.current_disposition` / `current_review_status` updated → audit log written.
- **Billing** — usage recorded → wallet debit entry → threshold crossed + recharge enabled → Stripe charge → `wallet_ledger_entries` updated.

## Known risks

The most recent readiness snapshot ([`docs/status-2026-04-13.md`](status-2026-04-13.md)) tracks open blockers: Stripe webhook credit idempotency, dispatch tenant-isolation hardening, atomic import-batch claiming, and the Supabase advisor flags (e.g. `ai_jobs` RLS-without-policies). These are documented, not yet resolved.
