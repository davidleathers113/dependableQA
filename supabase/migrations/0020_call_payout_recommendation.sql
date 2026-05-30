-- Follow-up to 0019: denormalize the AI payout recommendation and index the
-- qualification axis.
--
-- For pay-per-call (Ringba), the model's payout recommendation ("do not pay
-- publisher") is a high-value operational field — denormalize it onto `calls`
-- so it can be filtered and reported like the other disposition axes. Also add
-- the qualification-status index that 0019 omitted.

alter table public.calls
  add column if not exists ai_payout_recommendation text;

create index if not exists idx_calls_org_ai_payout_recommendation
on public.calls (organization_id, ai_payout_recommendation);

create index if not exists idx_calls_org_ai_qualification_status
on public.calls (organization_id, ai_qualification_status);
