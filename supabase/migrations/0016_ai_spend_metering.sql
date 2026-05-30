-- AI / call-processing spend metering.
--
-- The prepaid wallet (wallet_ledger_entries running balance, billing_accounts
-- per_minute_rate_cents) is debited once per call we process. Enqueueing AI work
-- is gated up front against the available balance; this migration adds the
-- transactional, idempotent DEBIT that settles actual usage on completion.
--
-- Mirrors apply_stripe_recharge_event: SECURITY-aware (set search_path = ''),
-- FOR UPDATE on the billing account to serialize balance math, service-role-only
-- EXECUTE, and a no-negative-balance guarantee.

-- Idempotency: at most one 'call_processing' debit per (organization, call).
create unique index if not exists wallet_ledger_call_processing_unique
on public.wallet_ledger_entries (organization_id, reference_id)
where reference_type = 'call_processing';

create or replace function public.apply_call_processing_debit(
  p_organization_id uuid,
  p_billing_account_id uuid,
  p_call_id uuid,
  p_amount_cents integer
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_current_balance integer;
  v_applied integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    return false;
  end if;

  perform 1
  from public.billing_accounts
  where id = p_billing_account_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'billing account % not found for organization %', p_billing_account_id, p_organization_id;
  end if;

  -- Idempotent: a debit already recorded for this call is a no-op.
  perform 1
  from public.wallet_ledger_entries
  where organization_id = p_organization_id
    and reference_type = 'call_processing'
    and reference_id = p_call_id;
  if found then
    return false;
  end if;

  select balance_after_cents
  into v_current_balance
  from public.wallet_ledger_entries
  where organization_id = p_organization_id
  order by created_at desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);

  -- Never drive the balance negative: deduct at most the available balance. The
  -- enqueue-time gate is the primary guard; this clamp is the backstop.
  v_applied := least(p_amount_cents, greatest(v_current_balance, 0));

  insert into public.wallet_ledger_entries (
    organization_id,
    billing_account_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    reference_type,
    reference_id,
    description
  ) values (
    p_organization_id,
    p_billing_account_id,
    'debit',
    v_applied,
    v_current_balance - v_applied,
    'call_processing',
    p_call_id,
    case
      when v_applied < p_amount_cents then 'Call processing (clamped to available balance)'
      else 'Call processing'
    end
  );

  return true;
end;
$$;

revoke execute on function public.apply_call_processing_debit(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_call_processing_debit(uuid, uuid, uuid, integer) to service_role;
