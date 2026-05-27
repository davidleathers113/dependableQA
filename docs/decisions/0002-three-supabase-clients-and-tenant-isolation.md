# ADR 0002: Three Supabase clients and application-side tenant isolation

- **Status:** Accepted
- **Date:** 2026-04-10

## Context

This is a multi-tenant system: every tenant-owned row carries `organization_id`, and a user must never see another organization's calls, recordings, or billing. Supabase offers RLS as the database-level guard, but background workers (AI queue, webhooks, import dispatch, Stripe) need to operate across the privileged boundary without a user session.

## Decision

Use three distinct Supabase clients (`src/lib/supabase/`):

1. **browser-client** — anon key, RLS-enforced, browser only.
2. **server-client** — anon key + cookie session, runs as the logged-in user, RLS-enforced. Used by middleware, pages, and user-scoped API reads.
3. **admin-client** (`getAdminSupabase()`) — service-role key, **bypasses RLS**. Used only by `src/server/**` and Netlify functions.

The service-role key is never exposed to app runtime/browser. In admin-client paths, **tenant isolation is enforced in application code** by always filtering `.eq("organization_id", session.organization.id)` and never trusting an `organizationId` from a request body.

## Consequences

- Workers can do their job without a user session; RLS still protects user-facing paths.
- The trade-off (and a tracked risk in the readiness snapshot): admin-client routes depend on app-side discipline rather than RLS. A missed `organization_id` filter, or trusting a body-supplied org id, is a cross-tenant leak. New server code touching tenant data must filter explicitly and be tested for isolation.
- `config.ts` accepts `SUPABASE_DATABASE_URL` as a fallback for `SUPABASE_URL` to support the Netlify Supabase integration.
