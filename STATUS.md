# DependableQA Project Status Report

**Date:** April 10, 2026  
**Architecture:** Astro SSR + React islands + Supabase + Tailwind v4 + Netlify functions

## Verified Snapshot

- Git working tree is **not clean**; there is substantial in-progress product work beyond the last commit.
- Latest baseline commit: `408e284` - `refactor: standardize Supabase environment variables and enhance configuration handling`
- Test status: `npm test` passes (`8` files, `27` tests)
- Build status: `npm run build` passes (`astro check && astro build`)
- Live Supabase project `gqvwuranduktvoqpuywq` is bootstrapped and matches `SUPABASE_URL` in `.env`
- `supabase/types.ts` now reflects the live schema rather than a generic placeholder

---

## Completed And Verified

### 1. Core Platform And Configuration
- The project has moved well beyond the starter template into a feature-oriented application with `src/features`, `src/lib`, `src/server`, authenticated `app` routes, and Netlify functions.
- Supabase client setup is implemented for browser, server, and admin use with shared configuration resolution in `src/lib/supabase/config.ts`.
- `middleware.ts` persists Supabase sessions and enforces authenticated app access.

### 2. Live Supabase Backend Bootstrap
- All five repo migrations were applied to the connected Supabase project in order.
- The live project now contains the expected `public` tables for identity, calls, imports, billing, alerts, API keys, audit logs, and related operational data.
- RLS is enabled with the expected policy coverage across app tables and `storage.objects`.
- The expected storage buckets exist and are private: `imports`, `recordings`, and `exports`.
- The critical functions and triggers are present, including `handle_new_user`, `is_org_member`, `has_org_role`, `set_updated_at`, and `sync_call_flag_summary`.
- Existing `auth.users` records were reconciled with `public.profiles`, and current auth/profile sync is healthy.

### 3. Seed Data And Demo Workspace
- `supabase/seed.sql` was validated against the live schema and applied successfully.
- The live project now contains the demo org `dependableqa-demo`.
- Verified seeded data includes a billing account, wallet ledger entries, one integration, one import batch, two calls, transcripts, one analysis, one flag, one review, an integration event, and an audit log.

### 4. Authenticated Product Surfaces
- Public and authenticated layouts are implemented with `AuthLayout`, app layouts, and the React app shell.
- App routes exist for overview, calls, imports, integrations, billing, AI, reports, updates, and settings.
- Call detail and import batch detail routes are implemented.
- The stale `frameworks` demo routes were removed because they were not backed by the live Supabase schema.

### 5. Real Data Wiring Through Supabase
- Overview, calls, imports, billing, integrations, reports, updates, AI, and settings surfaces are wired to real server/client data flows.
- Calls filtering is synchronized to URL search params.
- Profile, organization, team, alerts, and API settings surfaces are wired to persistence or server-side actions.
- Product updates are now sourced from content entries instead of static placeholder UI.
- The AI surface is wired through an org-scoped `/api/ai/query` flow backed by existing app data.

### 6. Imports, Ingestion, And Review Workflows
- Imports upload to Supabase storage, create import batches, and dispatch processing through `/api/imports/dispatch`.
- `src/server/import-dispatch.ts` parses CSV input, normalizes rows, creates calls/transcripts/source snapshots, records row-level errors, validates import storage paths, and marks fatal dispatch failures explicitly.
- Netlify integration ingest now requires a real integration lookup via `x-integration-id`, validates webhook auth before parsing payloads, rejects provider mismatches or malformed payloads, and writes clearer success/failure events.
- Call review actions are wired through `/api/calls/[callId]/review` for review-status changes, overrides, and flag handling.

### 7. Billing And Stripe Integration
- `/api/billing/portal` creates or reuses Stripe billing context and redirects to the Billing Portal.
- `netlify/functions/stripe-webhook.ts` handles billing-related events and writes billing/audit data.
- Shared Netlify request helpers now centralize raw-body parsing and case-insensitive header handling so webhook verification logic does not drift between Stripe and provider ingest.

### 8. Automated Verification And Type Safety
- `package.json` now includes `test` and `test:watch` scripts using Vitest.
- Focused automated coverage exists for Supabase config, middleware, CSV parsing, import dispatch, call review behavior, and provider ingest rejection/success paths.
- `supabase/types.ts` was regenerated from the live project and the app was updated to satisfy real schema-level types.
- `.env-example` now documents the shared provider ingest auth settings needed for webhook verification.

---

## Partially Implemented / Still Limited

- The AI assistant is implemented as a narrow org-scoped Q&A endpoint, not a full conversational or agentic product.
- Reports are now data-backed, but advanced reporting features like saved reports/export workflows are still limited or disabled.
- Integrations display and ingest data, and the generic webhook surface is now hardened, but provider-specific setup/configuration flows and deeper operational tooling are still incomplete.
- The app has focused automated tests, but not yet full end-to-end browser coverage for core user journeys.

---

## Immediate Priorities

### 1. Finish Provider Integration Productization
- Add provider-specific setup/configuration flows so teams can manage integration secrets, signature headers, and provider metadata without direct database edits.
- Expose better operator-facing integration diagnostics for recent rejects, degraded states, and remediation steps.

### 2. Expand High-Value Product Depth
- Deepen reporting, exports, and analytics beyond the current summary-level implementation.
- Evolve the AI assistant from a narrow org-data answer flow into a more capable product surface if that remains a goal.

### 3. Increase Verification Depth
- Add end-to-end coverage for auth, onboarding, import dispatch, call review, and critical settings mutations.
- Add a dedicated typecheck/lint workflow if stricter CI separation is desired.

---

## Recommended Next Step

Focus next on **provider-specific integration configuration and diagnostics**, because the external-input surface is now materially hardened, but teams still need a first-class way to manage webhook auth settings and understand why an integration is healthy, degraded, or rejecting payloads.

---

## Current File Changes

The working tree currently contains substantial in-progress changes beyond the last commit. At a high level:

### 1. Product UI And Route Work
- Auth pages and supporting auth components have been reworked, including login, signup, forgot-password, and reset-password flows.
- Marketing/homepage-related components and layouts have been added or updated.
- Core app feature surfaces have active modifications across overview, calls, billing, integrations, reports, AI, updates, and settings pages.

### 2. Data And Backend Work
- `src/lib/app-data.ts` has major ongoing changes.
- Supabase request/session helpers, middleware, import dispatch, and Netlify ingest code are modified.
- New API routes exist for AI and settings API-key management.
- New shared request/auth helpers exist for Netlify webhook handling, and focused ingest hardening tests were added.

### 3. Tests, Types, And Tooling
- `package.json`, `package-lock.json`, and `vitest.config.ts` reflect active testing/tooling work.
- Focused tests have been added for auth recovery, Supabase config, middleware, CSV parsing, import dispatch, provider ingest, and call review.
- `supabase/types.ts` has been regenerated from the live schema and is currently modified.

### 4. Content And Content Configuration
- `src/content.config.ts` is modified.
- New content entries exist under `src/content/updates/`.

### 5. Removed Legacy Surface
- The old `frameworks` detail page and its like API route have been deleted to keep the app aligned with the real Supabase schema.

### 6. Untracked / Generated Artifacts
- `.playwright-mcp/` contains multiple untracked browser snapshot YAML files.
- `homepage-desktop.png` and `homepage-mobile.png` are currently untracked image artifacts.
