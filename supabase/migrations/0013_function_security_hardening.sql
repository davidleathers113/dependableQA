begin;

-- Security-advisor cleanup for functions (2026-05-29).
--
-- 1. function_search_path_mutable: pin search_path on the three functions that
--    lacked it. All three are SECURITY INVOKER and already schema-qualify every
--    object they touch, so an empty search_path is safe and removes the
--    "role mutable search_path" warning. Bodies are otherwise unchanged.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_call_flag_summary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_call_id uuid;
begin
  target_call_id := coalesce(new.call_id, old.call_id);

  update public.calls c
  set
    flag_count = (
      select count(*)
      from public.call_flags f
      where f.call_id = target_call_id
        and f.status = 'open'
    ),
    has_flags = (
      select exists(
        select 1
        from public.call_flags f
        where f.call_id = target_call_id
          and f.status = 'open'
      )
    ),
    updated_at = now()
  where c.id = target_call_id;

  return null;
end;
$$;

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

-- Re-assert the service-role-only EXECUTE grant (CREATE OR REPLACE preserves it,
-- but make it explicit and idempotent).
revoke execute on function public.apply_stripe_recharge_event(text, text, uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.apply_stripe_recharge_event(text, text, uuid, uuid, integer, text, text) to service_role;

-- 2. anon_security_definer_function_executable: handle_new_user is an internal
--    auth.users trigger; it should never be callable as an RPC. Triggers fire
--    regardless of EXECUTE grants, so revoking from everyone is safe.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. is_org_member / has_org_role are SECURITY DEFINER helpers used inside the
--    RLS policies, which are all `to authenticated`. They were executable by
--    anon only via the default PUBLIC grant; anon never evaluates these (no anon
--    policy references them), so drop the PUBLIC/anon grant and keep the
--    explicit authenticated grant that RLS evaluation requires. (Both only ever
--    reveal the *caller's* own membership as a boolean, so authenticated access
--    is intentional and safe.)
revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
revoke execute on function public.has_org_role(uuid, public.organization_role[]) from public, anon;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated;

commit;
