begin;

-- Add covering indexes for foreign keys that the Supabase performance advisor
-- (2026-05-29) flagged as unindexed. Each FK below has no index whose leading
-- column matches the FK column: the existing organization-leading composite
-- indexes (e.g. idx_calls_org_publisher = (organization_id, publisher_id)) do
-- NOT cover a single-column FK on the trailing column, and several tables had
-- no covering index at all. `if not exists` keeps this idempotent; index names
-- follow the existing idx_<table>_<column> convention. (Plain CREATE INDEX, not
-- CONCURRENTLY, so the migration stays transactional; the affected tables are
-- small.)

-- alert_rules
create index if not exists idx_alert_rules_organization_id on public.alert_rules (organization_id);
create index if not exists idx_alert_rules_created_by on public.alert_rules (created_by);

-- api_keys
create index if not exists idx_api_keys_created_by on public.api_keys (created_by);

-- audit_logs
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs (actor_user_id);

-- call_review_notes
create index if not exists idx_call_review_notes_organization_id on public.call_review_notes (organization_id);
create index if not exists idx_call_review_notes_created_by on public.call_review_notes (created_by);

-- call_reviews
create index if not exists idx_call_reviews_organization_id on public.call_reviews (organization_id);
create index if not exists idx_call_reviews_reviewed_by on public.call_reviews (reviewed_by);

-- call_source_snapshots
create index if not exists idx_call_source_snapshots_organization_id on public.call_source_snapshots (organization_id);

-- call_transcripts
create index if not exists idx_call_transcripts_organization_id on public.call_transcripts (organization_id);

-- calls (org-leading composites do not cover these single-column FKs)
create index if not exists idx_calls_campaign_id on public.calls (campaign_id);
create index if not exists idx_calls_import_batch_id on public.calls (import_batch_id);
create index if not exists idx_calls_integration_id on public.calls (integration_id);
create index if not exists idx_calls_publisher_id on public.calls (publisher_id);

-- disposition_overrides
create index if not exists idx_disposition_overrides_organization_id on public.disposition_overrides (organization_id);
create index if not exists idx_disposition_overrides_changed_by on public.disposition_overrides (changed_by);

-- import_batches
create index if not exists idx_import_batches_integration_id on public.import_batches (integration_id);
create index if not exists idx_import_batches_uploaded_by on public.import_batches (uploaded_by);

-- import_row_errors
create index if not exists idx_import_row_errors_organization_id on public.import_row_errors (organization_id);

-- integration_events
create index if not exists idx_integration_events_integration_id on public.integration_events (integration_id);

-- notification_deliveries
create index if not exists idx_notification_deliveries_alert_rule_id on public.notification_deliveries (alert_rule_id);

-- organization_members
create index if not exists idx_organization_members_invited_by on public.organization_members (invited_by);

-- saved_views
create index if not exists idx_saved_views_user_id on public.saved_views (user_id);

-- wallet_ledger_entries
create index if not exists idx_wallet_ledger_entries_organization_id on public.wallet_ledger_entries (organization_id);

commit;
