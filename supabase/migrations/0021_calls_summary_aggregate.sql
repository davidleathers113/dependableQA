-- Full-set summary aggregation for the calls list.
--
-- getCallsSummary previously computed the summary cards in JS over at most 500
-- rows (a hard .limit(500)), so the cards could diverge from the filtered call
-- set once it exceeded 500 calls. This function computes the same metric shape
-- over the *entire* filtered set with count(*) aggregates.
--
-- SECURITY: this runs in the browser/SSR session under the caller's role
-- (`authenticated`), NOT service_role, so it is SECURITY INVOKER. Row-Level
-- Security on public.calls / public.call_flags (member-scoped select policies in
-- 0004_rls.sql) enforces tenant isolation; the p_org argument is only an
-- additional filter, not the isolation boundary. Mirrors the 0016-0018 RPC
-- convention of `set search_path = ''` with fully-qualified table names.
--
-- Disposition categorization mirrors getDispositionCategory() in
-- src/lib/app-data.ts EXACTLY, including its branch precedence: the "qualified"
-- substrings are tested before "disqualified", so e.g. "disqualified" (contains
-- "qualif") and "no sale" (contains "sale") both fall into "qualified". Keep
-- these two in lockstep or the cards will disagree with the row query.
create or replace function public.summarize_calls(
  p_org uuid,
  p_review_status text default null,
  p_publisher_id uuid default null,
  p_campaign_id uuid default null,
  p_disposition text default null,
  p_final_disposition text default null,
  p_conversion_status text default null,
  p_fraud_risk text default null,
  p_lead_quality text default null,
  p_payout_recommendation text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_call_ids uuid[] default null
)
returns table (
  total_calls bigint,
  flagged_calls bigint,
  needs_review_count bigint,
  compliance_flag_count bigint,
  qualified_count bigint,
  disqualified_count bigint,
  top_publisher_id uuid,
  top_publisher_flagged_calls bigint,
  top_publisher_total_calls bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select
      c.id,
      c.publisher_id,
      c.current_disposition,
      c.current_review_status,
      c.flag_count
    from public.calls c
    where c.organization_id = p_org
      and (p_review_status is null or c.current_review_status::text = p_review_status)
      and (p_publisher_id is null or c.publisher_id = p_publisher_id)
      and (p_campaign_id is null or c.campaign_id = p_campaign_id)
      and (p_disposition is null or c.current_disposition = p_disposition)
      and (p_final_disposition is null or c.ai_final_disposition = p_final_disposition)
      and (p_conversion_status is null or c.ai_conversion_status = p_conversion_status)
      and (p_fraud_risk is null or c.ai_fraud_risk = p_fraud_risk)
      and (p_lead_quality is null or c.ai_lead_quality = p_lead_quality)
      and (p_payout_recommendation is null or c.ai_payout_recommendation = p_payout_recommendation)
      and (p_date_from is null or c.started_at >= p_date_from)
      and (p_date_to is null or c.started_at <= p_date_to)
      -- p_call_ids null => no id filter; empty array => match nothing (matches
      -- the row query, which returns no rows for an empty match set).
      and (p_call_ids is null or c.id = any (p_call_ids))
  ),
  categorized as (
    select
      f.flag_count,
      f.current_review_status::text as current_review_status,
      case
        when lower(coalesce(f.current_disposition, '')) like '%qualif%'
          or lower(coalesce(f.current_disposition, '')) like '%sale%'
          or lower(coalesce(f.current_disposition, '')) like '%book%'
          or lower(coalesce(f.current_disposition, '')) like '%close%'
          then 'qualified'
        when lower(coalesce(f.current_disposition, '')) like '%disqual%'
          or lower(coalesce(f.current_disposition, '')) like '%reject%'
          or lower(coalesce(f.current_disposition, '')) like '%spam%'
          or lower(coalesce(f.current_disposition, '')) like '%no sale%'
          then 'disqualified'
        else 'other'
      end as disposition_category
    from filtered f
  ),
  publisher_rollup as (
    select
      f.publisher_id,
      count(*) as total_calls,
      count(*) filter (where f.flag_count > 0) as flagged_calls
    from filtered f
    group by f.publisher_id
    order by
      count(*) filter (where f.flag_count > 0) desc,
      count(*) desc,
      f.publisher_id nulls last
    limit 1
  ),
  compliance as (
    select count(*) as compliance_flag_count
    from public.call_flags cf
    where cf.organization_id = p_org
      and cf.status = 'open'
      and lower(coalesce(cf.flag_category, '')) like '%compliance%'
      and cf.call_id in (select id from filtered)
  )
  select
    (select count(*) from categorized)::bigint,
    (select count(*) from categorized where flag_count > 0)::bigint,
    (select count(*) from categorized where current_review_status is distinct from 'reviewed')::bigint,
    (select compliance_flag_count from compliance)::bigint,
    (select count(*) from categorized where disposition_category = 'qualified')::bigint,
    (select count(*) from categorized where disposition_category = 'disqualified')::bigint,
    (select publisher_id from publisher_rollup),
    coalesce((select flagged_calls from publisher_rollup), 0)::bigint,
    coalesce((select total_calls from publisher_rollup), 0)::bigint;
$$;

revoke execute on function public.summarize_calls(
  uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, uuid[]
) from public, anon;
grant execute on function public.summarize_calls(
  uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, uuid[]
) to authenticated, service_role;
