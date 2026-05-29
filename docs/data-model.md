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

RLS is the backstop. Many server paths use the **service-role admin client, which bypasses RLS** — those paths must filter `organization_id` in application code. See [ADR 0002](decisions/0002-three-supabase-clients-and-tenant-isolation.md).

## Deduplication

Source imports use a deterministic duplicate guard (`organization_id` + `source_provider` + `external_call_id`, or a composite fallback) so re-delivered or re-imported calls don't inflate metrics. Calls also carry a unique `(organization_id, dedupe_hash)` constraint; CSV import and integration ingest both upsert on it.

Stripe events are deduped by `processed_stripe_events` (PK on `stripe_event_id`), so a duplicate webhook delivery applies a wallet recharge at most once.

## Wallet ledger invariant

The wallet balance is **derived** — it is the `balance_after_cents` of the most recent `wallet_ledger_entries` row for an organization, not a stored column. To keep that derivation race-free, **any code that inserts a `wallet_ledger_entries` row must first lock the corresponding `billing_accounts` row with `SELECT … FOR UPDATE`** (as `apply_stripe_recharge_event` does — see `0009_stripe_event_idempotency.sql`). A future debit/adjustment/refund writer that skips this lock would reintroduce a lost-update race on the balance. If write volume grows, prefer promoting the balance to a locked column on `billing_accounts` over inferring it from the latest ledger row.

## Triggers

- `set_updated_at` — maintains `updated_at` across most tables.
- `handle_new_user` — provisions a `profiles` row on `auth.users` insert.
- `sync_call_flag_summary` — keeps the `calls` flag rollup (count / top flag) in sync with `call_flags`.

## Storage

Three **private** buckets (`0005_storage.sql`): `imports` (uploaded CSVs), `recordings` (call audio — PII), `exports` (generated report files). Bucket policies require org membership; the recordings bucket holds sensitive audio — see [`docs/security` ↗](../SECURITY.md).

## Known advisor flags

From the readiness snapshot ([`docs/status-2026-04-13.md`](status-2026-04-13.md)): `ai_jobs` has RLS enabled with no policies (accessed only via the service-role worker), `organizations` has a permissive insert policy, several foreign keys lack covering indexes, and Supabase Auth leaked-password protection is disabled. Track these before unrestricted multi-tenant launch.
