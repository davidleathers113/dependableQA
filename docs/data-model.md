---
title: Data Model
owner: Engineering
last-reviewed: 2026-05-27
---

# Data Model

The database is Supabase Postgres 17. The schema is defined entirely by the numbered SQL files in `supabase/migrations/` — **those files are the source of truth** (see [ADR 0004](decisions/0004-migrations-as-source-of-truth.md)). `supabase/types.ts` is generated from the live schema and is what the application is typed against.

## Migration workflow

1. Add a new numbered SQL file in `supabase/migrations/` (e.g. `0009_*.sql`). Numbering must be **contiguous** — `npm run check:migrations` fails otherwise.
2. Apply it to the target Supabase project via the Supabase CLI or MCP tooling.
3. Regenerate `supabase/types.ts` from the live schema.
4. Run `npm run ci:verify`.

Never apply schema-only changes in the Supabase UI without committing a matching migration file.

Current migrations:

| File | Adds |
|---|---|
| `0001_core_identity.sql` | Enums, `profiles`, `organizations`, `organization_members`; `handle_new_user`, `is_org_member`, `has_org_role`, `set_updated_at` |
| `0002_operations.sql` | `integrations`, `integration_events`, `import_batches`, `import_row_errors`, `publishers`, `campaigns`, `calls`, `call_source_snapshots`, `call_transcripts`, `call_analyses`, `call_flags`, `call_reviews`, `disposition_overrides`; `sync_call_flag_summary` trigger |
| `0003_settings_billing_audit.sql` | `saved_views`, `alert_rules`, `notification_deliveries`, `billing_accounts`, `wallet_ledger_entries`, `api_keys`, `audit_logs` |
| `0004_rls.sql` | Row-level security enable + policies across the public tables |
| `0005_storage.sql` | Private storage buckets `imports`, `recordings`, `exports` + bucket policies |
| `0006_billing_payment_method_sync.sql` | Stripe payment-method columns on `billing_accounts` |
| `0007_ai_pipeline.sql` | `ai_jobs` queue; transcription/analysis status columns on `calls` |
| `0008_call_review_workspace.sql` | `call_review_notes`; time-bound columns on `call_flags` |
| `0009_stripe_event_idempotency.sql` | `processed_stripe_events` (Stripe dedup); `wallet_ledger_entries.stripe_event_id`; `apply_stripe_recharge_event` RPC |
| `0010_ai_analysis_idempotency.sql` | Unique `(organization_id, call_id, analysis_version)` on `call_analyses` (idempotent re-analysis) |
| `0011_organization_onboarding.sql` | Drops the permissive `organizations` insert policy; adds `create_organization_with_owner(name)` transactional onboarding RPC |
| `0012_fk_covering_indexes.sql` | Covering indexes for 24 previously-unindexed foreign keys |
| `0013_function_security_hardening.sql` | Pins `search_path` on `set_updated_at` / `sync_call_flag_summary` / `apply_stripe_recharge_event`; tightens EXECUTE grants on `handle_new_user` / `is_org_member` / `has_org_role` |
| `0014_ringba_ingest_key_hash.sql` | `integrations.public_ingest_key_hash` (generated, SHA-256) + unique partial index for indexed Ringba pixel lookup |
| `0015_ringba_import_batches.sql` | `ringba_import_batches` (manual full-API import tracking) with CHECK-constrained status/behavior + member-read / owner-admin-manage RLS |
| `0016_ai_spend_metering.sql` | `apply_call_processing_debit` RPC (transactional, no-negative, service-role-only) + unique partial index for one `call_processing` debit per (org, call) |

## The three layers

The tables map onto the [three data layers](architecture.md#three-data-layers):

**Source (immutable):** `integration_events`, `import_batches`, `import_row_errors`, `call_source_snapshots`, the raw transcript source. These preserve exactly what arrived.

**Normalized:** `calls` (canonical record), `publishers`, `campaigns`, `call_transcripts`.

**QA (mutable):** `call_analyses`, `call_flags`, `call_reviews`, `call_review_notes`, `disposition_overrides`. `calls.current_disposition` and `calls.current_review_status` are the rolled-up current state; the override/review rows are the history behind them.

**Identity / config / billing:** `profiles`, `organizations`, `organization_members`, `integrations`, `saved_views`, `alert_rules`, `notification_deliveries`, `api_keys`, `billing_accounts`, `wallet_ledger_entries`, `audit_logs`, `ai_jobs`.

### Enums

`organization_role` (owner/admin/reviewer/analyst/billing), `integration_provider` (ringba/retreaver/trackdrive/custom), `integration_status` (connected/degraded/error/disconnected), `source_kind` (csv/webhook/api/pixel), `import_batch_status` (uploaded/validating/processing/completed/partial/failed/archived), `call_review_status` (unreviewed/in_review/reviewed/reopened).

## Tenant isolation & RLS

Every tenant-owned row carries `organization_id`. RLS is strict and boring: read access requires the authenticated user to be a member of the row's organization (`is_org_member`); elevated writes additionally check role (`has_org_role`). Helper SQL functions `is_org_member(org_id)` and `has_org_role(org_id, allowed_roles[])` back the policies.

RLS is the backstop. Many server paths use the **service-role admin client, which bypasses RLS** — those paths must filter `organization_id` in application code. See [ADR 0002](decisions/0002-three-supabase-clients-and-tenant-isolation.md). These invariants are proven at the database layer (not just app-side) by `tests/db/rls-tenant-isolation.test.ts` — see [testing](testing.md#db-level-tests-npm-run-testdb).

### Service-role-only (deny-all) tables

`ai_jobs` and `processed_stripe_events` have **RLS enabled with no policies**. This is intentional and is a load-bearing invariant: with no policy, `anon` and `authenticated` are denied all access, and the tables are reachable **only** through the service-role admin client (the AI worker and the Stripe webhook), which bypasses RLS. The Supabase advisor will always flag these as `rls_enabled_no_policy` — that flag is expected here, not a gap. The deny-all behaviour is asserted in `tests/db/rls-tenant-isolation.test.ts` (a seeded row exists yet is invisible to `authenticated`/`anon`, and writes are rejected). Any future need to expose these tables to end users must go through the service layer, not a new RLS policy.

### Organization onboarding

There is **no client-facing arbitrary insert** on `organizations` (the old `WITH CHECK (true)` policy was dropped in `0011`). Org creation happens either server-side via the service-role admin client (`createOrganizationForUser`) or through the `create_organization_with_owner(name)` RPC — a `SECURITY DEFINER`, `search_path`-pinned function that creates the org and the caller's (`auth.uid()`) owner membership atomically and is EXECUTE-granted to `authenticated` only. Covered by `tests/db/organization-onboarding.test.ts`.

## Deduplication

Source imports use a deterministic duplicate guard (`organization_id` + `source_provider` + `external_call_id`, or a composite fallback) so re-delivered or re-imported calls don't inflate metrics. Calls also carry a unique `(organization_id, dedupe_hash)` constraint; CSV import and integration ingest both upsert on it.

Stripe events are deduped by `processed_stripe_events` (PK on `stripe_event_id`), so a duplicate webhook delivery applies a wallet recharge at most once.

## Wallet ledger invariant

The wallet balance is **derived** — it is the `balance_after_cents` of the most recent `wallet_ledger_entries` row for an organization, not a stored column. To keep that derivation race-free, **any code that inserts a `wallet_ledger_entries` row must first lock the corresponding `billing_accounts` row with `SELECT … FOR UPDATE`** (as `apply_stripe_recharge_event` and `apply_call_processing_debit` both do). A future debit/adjustment/refund writer that skips this lock would reintroduce a lost-update race on the balance.

**AI spend metering (`0016`).** Processing a call debits the wallet via `apply_call_processing_debit` — billed at `billing_accounts.per_minute_rate_cents` × billable minutes (rounded up, min 1). It is idempotent (one `call_processing` debit per `(organization_id, reference_id=call_id)`, enforced by a unique partial index) and **never drives the balance negative** (it deducts at most the available balance). The enqueue gate (`enqueueAnalysisForCalls`) estimates the batch's transcription cost and refuses up front (HTTP 402) when it would exceed the balance; the debit settles actual usage when a transcription job completes. Orgs without a `billing_accounts` row are not metered (and not blocked). This pilot design (estimate-gate at enqueue + debit-actual on completion) can briefly over-commit under concurrent batches; the production target is reservation-at-enqueue with reconcile-on-completion, which the idempotent per-call debit already supports. If write volume grows, prefer promoting the balance to a locked column on `billing_accounts` over inferring it from the latest ledger row.

## Triggers

- `set_updated_at` — maintains `updated_at` across most tables. (`search_path` pinned in `0013`.)
- `handle_new_user` — provisions a `profiles` row on `auth.users` insert. `SECURITY DEFINER`; EXECUTE revoked from all roles in `0013` (triggers fire regardless of grants) so it cannot be called as an RPC.
- `sync_call_flag_summary` — keeps the `calls` flag rollup (count / top flag) in sync with `call_flags`. (`search_path` pinned in `0013`.)

## Storage

Three **private** buckets (`0005_storage.sql`): `imports` (uploaded CSVs), `recordings` (call audio — PII), `exports` (generated report files). Bucket policies require org membership; the recordings bucket holds sensitive audio — see [`docs/security` ↗](../SECURITY.md).

## Known advisor flags

Most of the earlier advisor flags were resolved in Phase 3 (2026-05-29; see [`docs/status-2026-05-29.md`](status-2026-05-29.md)): the `organizations` permissive insert policy was dropped (`0011`), 24 unindexed foreign keys got covering indexes (`0012`), and three functions had `search_path` pinned plus EXECUTE grants tightened (`0013`). **Remaining/accepted flags:** `ai_jobs` and `processed_stripe_events` RLS-without-policies (the intentional service-role-only deny-all documented above), `extension_in_public` for `citext` (columns depend on it; moving is disruptive), `authenticated`-executable `SECURITY DEFINER` on `is_org_member`/`has_org_role` (RLS evaluation requires it) and `create_organization_with_owner` (the onboarding RPC), Supabase Auth leaked-password protection (a dashboard toggle), and the scale-only `auth_rls_initplan` / `multiple_permissive_policies` performance items. Track the latter before high-volume launch.
