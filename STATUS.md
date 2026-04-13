# DependableQA Project Status Report

**Date:** April 13, 2026  
**Architecture:** Astro SSR + React islands + Supabase + Tailwind v4 + Netlify functions  
**Current production-readiness verdict:** `Partially ready`

## Verified Snapshot

- `npm run ci:verify` passes.
- Current verification gate result: `33` test files, `134` tests, all passing.
- `astro check` and `astro build` both pass inside the verification gate.
- Netlify site is linked and active as `dependableqa` with production URL `https://dependableqa.com`.
- Live Supabase project `gqvwuranduktvoqpuywq` is healthy and matches the configured Supabase URL family.
- Repo migrations now total `7` files, not `5`.
- Live public schema shows multi-tenant tables for identity, organizations, calls, imports, integrations, billing, API keys, audit logs, and AI jobs.
- Live storage buckets exist and are private: `imports`, `recordings`, and `exports`.

---

## Completed And Verified

### 1. Core Platform And Configuration
- The project is well beyond the original starter and is organized around product features under `src/features`, `src/lib`, `src/server`, authenticated `app` routes, and Netlify functions.
- Supabase browser, server, and admin client setup is implemented with shared config resolution in `src/lib/supabase/config.ts`.
- `src/middleware.ts` creates the server Supabase client, hydrates request auth state, and protects `/app` routes.
- The repo has an explicit release gate in `npm run ci:verify`, and Netlify deploys are configured to use that same gate.

### 2. Live Supabase Backend And Schema
- The live Supabase project is active and healthy.
- The schema includes the expected org-scoped operational tables for organizations, memberships, imports, calls, analyses, flags, reviews, billing, API keys, alerts, audit logs, and AI jobs.
- RLS is enabled broadly across the core public tables.
- Storage bucket policies exist for `imports`, `recordings`, and `exports`, and all three buckets are private.
- Core helper functions and triggers exist, including `handle_new_user`, `is_org_member`, `has_org_role`, `set_updated_at`, and `sync_call_flag_summary`.

### 3. Authenticated Product Surfaces
- Public auth surfaces exist for login, signup, forgot-password, reset-password, and onboarding.
- Authenticated app routes exist for overview, calls, imports, integrations, billing, AI, reports, updates, and settings.
- Call detail and import batch detail routes are implemented.
- App-level data is server-rendered first and then refreshed through client islands where needed.

### 4. Real Data Wiring Through Supabase
- Overview, calls, imports, billing, integrations, reports, updates, AI, and settings all read from real app data flows rather than placeholder content.
- Calls filtering is synchronized to URL params.
- Settings surfaces for profile, organization, team, alerts, API keys, and integrations are wired through real persistence flows.
- The integrations UI now uses authenticated server-backed reads for summary and diagnostics instead of exposing secrets to the browser.
- The AI assistant surface is wired through an org-scoped `/api/ai/query` endpoint.

### 5. Imports, Ingestion, And Review Workflows
- Imports upload to Supabase storage, create import batches, and dispatch through `/api/imports/dispatch`.
- `src/server/import-dispatch.ts` parses CSV data, normalizes rows, writes calls and transcripts, records row errors, validates storage paths, and marks failed batches explicitly.
- `netlify/functions/integration-ingest.ts` performs integration lookup, validates webhook auth, rejects malformed or mismatched payloads, and writes integration events.
- Integration webhook auth settings can be updated in-product and are normalized into a canonical `integrations.config.webhookAuth` shape.
- Call review actions are implemented through `/api/calls/[callId]/review`.

### 6. Billing And Stripe Surface
- Billing routes exist for portal access, setup checkout, funding checkout, and recharge settings.
- `netlify/functions/stripe-webhook.ts` processes Stripe events and writes billing-side effects plus audit activity.
- Shared Netlify request helpers centralize raw-body parsing and case-insensitive header access for webhook handling.

### 7. Automated Verification And Type Safety
- `package.json` includes `test`, `test:watch`, `build`, and `ci:verify`.
- Focused automated coverage exists for middleware, auth recovery, Supabase config, import dispatch, provider ingest, integrations settings, AI routes, and call review behavior.
- `supabase/types.ts` is generated from the live schema and matches current database structure.
- `.env-example` documents the core runtime environment expected by the app.

---

## Production Readiness Assessment

### Overall State
- The app has a credible multi-user foundation: authenticated app routes, org-scoped data model, broad RLS coverage, private storage buckets, and a passing verification pipeline.
- It is **not yet ready for unrestricted real-world multi-user production use**.
- The largest remaining risks are not cosmetic. They are in billing integrity, dispatch hardening, server auth validation, and proof of tenant isolation under test.

### Current Readiness Rating
- Overall readiness: `Partially ready`
- Confidence: `High`
- Launch recommendation: `Do not launch yet`

### Critical Blockers
- Billing credits are not idempotent or transaction-safe in `netlify/functions/stripe-webhook.ts`. Duplicate Stripe deliveries or concurrent events can produce duplicate wallet credits or incorrect balances.
- Netlify production and preview contexts are missing Stripe runtime secrets required by the billing routes and Stripe webhook.
- `netlify/functions/import-dispatch.ts` accepts `organizationId` and `batchId` from the request body and runs with the service-role client, so a leaked shared secret could be used to dispatch work across tenants.
- Import batch claiming in `src/server/import-dispatch.ts` is not atomic, so concurrent dispatches can race.

### Major Risks
- Protected server auth paths rely on `supabase.auth.getSession()` rather than a stronger verified-user server pattern.
- The codebase uses the service-role client in many API routes and workers. That is workable, but it means tenant isolation depends heavily on application-side `.eq("organization_id", ...)` discipline instead of always relying on RLS.
- Supabase advisors currently flag:
  - `public.ai_jobs` has RLS enabled with no policies.
  - `public.organizations` has an overly permissive insert policy.
  - leaked password protection is disabled in Supabase Auth.
  - multiple foreign keys are missing covering indexes.
- The Ringba pixel ingest path still uses a query-string `api_key`, which is easier to leak through logs and referrers than header-based auth.

---

## Verified Environment And Runtime Notes

### Netlify
- The linked Netlify project is `dependableqa`.
- `netlify.toml` uses `npm run ci:verify` for builds.
- Production context currently exposes:
  - `AI_DISPATCH_SHARED_SECRET`
  - `APP_URL`
  - `IMPORT_DISPATCH_SHARED_SECRET`
  - `INTEGRATION_INGEST_SHARED_SECRET`
  - `OPENAI_API_KEY`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_DATABASE_URL`
  - `SUPABASE_JWT_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Deploy-preview currently exposes the same set except `APP_URL`.
- Production-critical Stripe env vars are not currently present in the audited Netlify contexts.

### Supabase
- Project: `gqvwuranduktvoqpuywq`
- Status: `ACTIVE_HEALTHY`
- Region: `us-west-2`
- Database engine: Postgres `17`
- Live row counts show a very small dataset today, including `1` organization, `2` profiles, `2` calls, `2` transcripts, and `1` import batch. The platform has not yet been proven under real multi-tenant load.

---

## Partially Implemented / Still Limited

- The AI assistant is a narrow org-scoped Q&A surface, not a broader conversational or operational agent experience.
- Reports are data-backed, but advanced reporting, exports, and saved-report workflows are still limited.
- Integrations support in-product auth configuration and diagnostics, but deeper provider onboarding and test tooling are still incomplete.
- The app has focused automated tests, but not end-to-end browser coverage for the highest-risk multi-user flows.
- Multi-tab/session UX remains limited: there is no obvious general logout flow in the app shell, and session synchronization across tabs is minimal.

---

## Immediate Priorities

### 1. Fix Launch Blockers
- Make Stripe recharge application idempotent and transactional.
- Add the missing Stripe secrets to Netlify production and preview contexts.
- Remove or harden the public import dispatch function so tenant scope is never caller-controlled.
- Make import batch claiming atomic.

### 2. Strengthen Auth And Isolation
- Move protected server auth flows to a verified-user pattern instead of relying only on `getSession()`.
- Reduce service-role usage where it is not strictly required.
- Tighten the permissive `organizations` insert policy.
- Enable leaked password protection in Supabase Auth.

### 3. Improve Proof And Confidence
- Add DB-level tests that prove RLS and tenant isolation actually hold for cross-org reads and writes.
- Add focused coverage for billing routes, API key management, request-session resolution, scheduled AI dispatch, and Stripe webhook failure paths.
- Add missing indexes identified by Supabase performance advisors.

---

## Recommended Next Step

Focus next on **production hardening**, not new product surface area. The highest-value work now is fixing billing idempotency, locking down the dispatch path, completing Netlify runtime config, and adding DB-backed tenant-isolation tests so the app can safely move from a strong prototype to a real multi-user production system.
