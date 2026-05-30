-- Call disposition intelligence (analysis schema v3:v2).
--
-- The analysis output gained a vertical-agnostic "disposition" block answering,
-- for every call, three questions: what happened (final disposition + journey
-- stage), was it valuable (qualification + conversion + lead quality), and was
-- it risky (fraud). The full block lives in call_analyses.structured_output.
--
-- The list/summary/report queries select from `calls` and filter on
-- `calls.current_disposition`, so we denormalize the FILTERABLE axes onto
-- `calls` (mirroring how current_disposition already lives here). These columns
-- are written by the analysis path (src/server/analyze-call.ts) on each
-- successful analysis. They are nullable: calls without a v3 analysis stay null
-- and the UI shows a "re-analyze to generate" empty state.

alter table public.calls
  add column if not exists ai_final_disposition text,
  add column if not exists ai_journey_stage text,
  add column if not exists ai_qualification_status text,
  add column if not exists ai_conversion_status text,
  add column if not exists ai_conversion_type text,
  add column if not exists ai_fraud_risk text,
  add column if not exists ai_fraud_likely boolean,
  add column if not exists ai_lead_quality text,
  add column if not exists ai_billable_recommendation text,
  -- Records which analysis version (prompt:schema) populated the columns above.
  add column if not exists ai_analysis_version text;

-- Filter/report indexes, mirroring idx_calls_org_disposition.
create index if not exists idx_calls_org_ai_fraud_risk
on public.calls (organization_id, ai_fraud_risk);

create index if not exists idx_calls_org_ai_final_disposition
on public.calls (organization_id, ai_final_disposition);

create index if not exists idx_calls_org_ai_lead_quality
on public.calls (organization_id, ai_lead_quality);

create index if not exists idx_calls_org_ai_conversion_status
on public.calls (organization_id, ai_conversion_status);
