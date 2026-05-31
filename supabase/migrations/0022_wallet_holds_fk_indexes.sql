-- Standalone indexes for the wallet_processing_holds foreign keys.
--
-- 0018 created the table with FKs to billing_accounts and calls but only added
-- a (organization_id, call_id) unique partial index and a (organization_id,
-- status) index. Neither covers billing_account_id alone or call_id alone, so
-- cascading deletes on the parents and FK lookups do sequential scans (the
-- Supabase unindexed-FK advisor flags both). Add covering indexes; mirrors the
-- FK-index convention established in 0012_fk_covering_indexes.sql.
create index if not exists idx_wallet_processing_holds_billing_account_id
  on public.wallet_processing_holds (billing_account_id);

create index if not exists idx_wallet_processing_holds_call_id
  on public.wallet_processing_holds (call_id);
