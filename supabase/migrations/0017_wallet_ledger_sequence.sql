-- Deterministic wallet balance ordering.
--
-- The wallet balance is derived as "the balance_after_cents of the most recent
-- ledger row". That was ordered by `created_at desc limit 1`, which is
-- NON-DETERMINISTIC when two rows share a created_at (seed rows do; concurrent
-- recharge/debit in the same millisecond can too) — the "latest" row is then
-- undefined, so the reported balance can be wrong. `id` is a random uuid and
-- can't serve as a tiebreak.
--
-- Add a monotonic `seq` (insertion order) and order every balance derivation by
-- it. Existing rows are backfilled in physical order on ALTER; the guarantee is
-- strict monotonicity for all future inserts.

alter table public.wallet_ledger_entries
  add column if not exists seq bigint generated always as identity;

create index if not exists idx_wallet_ledger_entries_org_seq
  on public.wallet_ledger_entries (organization_id, seq desc);

-- Recreate both balance-mutating RPCs to read the current balance by `seq desc`
-- instead of `created_at desc`. (CREATE OR REPLACE preserves grants; re-asserted
-- below for clarity.)

create or replace function public.apply_stripe_recharge_event(
  p_stripe_event_id text,
  p_event_type text,
  p_organization_id uuid,
  p_billing_account_id uuid,
  p_amount_cents integer,
  p_customer_id text,
  p_checkout_session_id text
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_current_balance integer;
begin
  insert into public.processed_stripe_events (stripe_event_id, event_type)
  values (p_stripe_event_id, p_event_type)
  on conflict (stripe_event_id) do nothing;

  if not found then
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

  select balance_after_cents
  into v_current_balance
  from public.wallet_ledger_entries
  where organization_id = p_organization_id
  order by seq desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);

  insert into public.wallet_ledger_entries (
    organization_id,
    billing_account_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    reference_type,
    description,
    stripe_event_id
  ) values (
    p_organization_id,
    p_billing_account_id,
    'recharge',
    p_amount_cents,
    v_current_balance + p_amount_cents,
    'stripe_checkout_session',
    'Stripe checkout session ' || p_checkout_session_id,
    p_stripe_event_id
  );

  update public.billing_accounts
  set last_successful_charge_at = now(),
      stripe_customer_id = coalesce(nullif(p_customer_id, ''), stripe_customer_id)
  where id = p_billing_account_id;

  return true;
end;
$$;

revoke execute on function public.apply_stripe_recharge_event(text, text, uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.apply_stripe_recharge_event(text, text, uuid, uuid, integer, text, text) to service_role;

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
  order by seq desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);

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
