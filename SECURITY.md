# Security

DependableQA is a private, multi-tenant product that stores call recordings and transcripts (PII), customer billing data, and provider credentials. This document describes how the system protects that data and how to report a problem.

## Reporting a vulnerability

Report suspected vulnerabilities or data-exposure issues privately to the engineering owner — **do not** open a public issue or include exploit details in a PR. Include reproduction steps and the affected component.

## Sensitive data

- **Call recordings & transcripts** live in the private Supabase `recordings` bucket and `call_transcripts`. Treat them as PII: never copy them outside the system, log their contents, or include them in examples or test fixtures.
- **Billing data** lives in `billing_accounts` / `wallet_ledger_entries`; Stripe is the system of record for payment instruments.
- **Provider credentials** (e.g. Ringba access tokens) live in `integrations.config`. Don't surface them to the browser — integration UIs read server-backed summaries, not raw secrets.

## Secrets

- All secrets come from environment variables ([docs/environment.md](docs/environment.md)); `.env*` files are gitignored. The repo's `.gitignore` also blocks `*.pem`, `*.key`, `credentials*.json`, etc.
- Never commit secrets, tokens, or live project references — `.env-example` uses placeholders only.
- The Supabase **service-role key** and Stripe secret key are server-only. They must never appear in client bundles or `astro:env/client` config.

## Tenant isolation

- Every tenant-owned row carries `organization_id`. Row-level security (RLS) policies restrict access to organization members, with role checks for elevated actions (see [docs/data-model.md](docs/data-model.md)).
- **Critical:** the service-role admin client used by `src/server/**` and Netlify functions **bypasses RLS**. In those paths, tenant isolation is enforced in application code — always filter `.eq("organization_id", session.organization.id)` and never trust an `organizationId` taken from a request body. See [ADR 0002](docs/decisions/0002-three-supabase-clients-and-tenant-isolation.md). New server code touching tenant data must be tested for isolation.

## Endpoint & webhook auth

- App API routes require an authenticated session resolved to an active organization (`requireApiSession`).
- Protected Netlify functions authenticate with a shared-secret header compared in constant time (`src/server/netlify-request.ts`); the Stripe webhook verifies the `stripe-signature`; integration webhooks support shared-secret or HMAC-SHA256 (see [docs/integrations.md](docs/integrations.md)).
- The Ringba pixel currently authenticates via a query-string `api_key` — a tracked weakness (easier to leak via logs/referrers). Prefer header/HMAC auth for new providers.

## Input validation

All external input is validated with Zod or string methods — **no regex**, to avoid ReDoS ([ADR 0003](docs/decisions/0003-no-regex-zod-only-policy.md)). The transcription path includes IP checks to guard against SSRF when fetching recording URLs.

## Dependencies

Dependency updates are automated via Renovate (`renovate.json`). Review and merge security updates promptly.

## Known gaps

The [current readiness snapshot](docs/status-2026-05-29.md) tracks security-relevant items.

**Resolved (Phase 1, 2026-05-29):** Stripe webhook credit idempotency is now enforced by a transactional, dedup-guarded RPC (migration `0009`); the `import-dispatch` Netlify function that trusted a body-supplied `organizationId` under the service-role client was removed.

**Resolved (Phase 3, 2026-05-29):** DB-level RLS tenant isolation and Stripe-RPC idempotency/concurrency are now proven against real Postgres (`npm run test:db`, see [docs/testing.md](docs/testing.md)). The `organizations` permissive insert policy was dropped in favor of a transactional `create_organization_with_owner` RPC (`0011`); 24 unindexed foreign keys got covering indexes (`0012`); `search_path` was pinned on three functions and EXECUTE grants tightened on `handle_new_user`/`is_org_member`/`has_org_role` (`0013`). The `ai_jobs` and `processed_stripe_events` service-role-only deny-all invariant is documented ([docs/data-model.md](docs/data-model.md#service-role-only-deny-all-tables)) and tested.

**Resolved (Phase 4, 2026-05-29):** protected server auth no longer trusts an unverified cookie session. The middleware validates every request with `supabase.auth.getUser()` (which verifies the JWT against the Auth server, rejecting revoked/deleted/expired users) and stores the verified user in `locals.user`; `requireAppSession` (pages) and `requireApiSession` (API routes) derive identity from `locals.user`, not `getSession()`. Session-resolution tests cover no-user, no-email, no-org, active-org-not-a-member, and multiple-org cases.

**Still open:** Supabase Auth leaked-password protection (a dashboard toggle — enable in Authentication → Providers); Ringba pixel / scheduled-function hardening (Phase 5). Accepted/expected advisor flags: `rls_enabled_no_policy` on the two deny-all tables, `extension_in_public` for `citext`, and `authenticated`-executable `SECURITY DEFINER` on the RLS helper functions + onboarding RPC (all required). Factor the open items in before unrestricted production use.

**Invariant (wallet ledger):** any code that inserts `wallet_ledger_entries` must first lock the corresponding `billing_accounts` row (`SELECT … FOR UPDATE`), as `apply_stripe_recharge_event` does. The running balance is derived from the latest ledger row, so an unlocked writer could reintroduce a lost-update race.
