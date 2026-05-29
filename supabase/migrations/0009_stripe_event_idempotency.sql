begin;

-- Durable dedup ledger of processed Stripe events. Service-role-only: RLS is
-- enabled with no policies, so anon/authenticated are denied; the Stripe webhook
-- touches it exclusively through the service-role admin client (which bypasses
-- RLS), matching the ai_jobs invariant.
create table if not exists public.processed_stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;

-- Tie each recharge ledger row back to its originating Stripe event for
-- reconciliation. reference_id stays uuid/null because Stripe ids are strings.
alter table public.wallet_ledger_entries
  add column if not exists stripe_event_id text;

-- Atomic, idempotent application of a Stripe wallet recharge. The whole body
-- runs in one transaction: the processed_stripe_events PK makes duplicate event
-- deliveries a no-op, and `for update` on the billing account serializes
-- concurrent recharges so the read-compute-insert of the running balance cannot
-- race. Returns true when the event was newly applied, false when it was a
-- duplicate (already processed).
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
  order by created_at desc
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

commit;
