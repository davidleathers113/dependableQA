-- Wallet processing holds: reserve-at-enqueue, reconcile-on-completion.
--
-- The enqueue gate previously read the wallet balance and compared it to the
-- estimated cost with NO hold. Two concurrent analyze-selected requests could
-- both pass the check, so completed work could exceed the balance and go
-- under-billed (the debit clamps to available, silently dropping the overage).
--
-- This adds a holds ledger so "available balance" accounts for in-flight work.
-- A reservation is taken atomically at enqueue (serialized by FOR UPDATE on the
-- billing account, which kills the race); the per-call debit on completion
-- SETTLES the matching hold; a terminal failure / no-media skip RELEASES it; and
-- an expiry + sweep guarantees a lost job can never leak available balance
-- forever. Mirrors the 0016/0017 RPC conventions: set search_path = '',
-- FOR UPDATE balance math, service-role-only EXECUTE.

create table if not exists public.wallet_processing_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'open' check (status in ('open', 'settled', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one OPEN hold per call (idempotent re-enqueue).
create unique index if not exists wallet_processing_holds_open_unique
  on public.wallet_processing_holds (organization_id, call_id)
  where status = 'open';

-- Available-balance math and the sweep scan by org + status.
create index if not exists idx_wallet_processing_holds_org_status
  on public.wallet_processing_holds (organization_id, status);

-- Service-role-only: RLS enabled with NO policies (mirrors ai_jobs and
-- processed_stripe_events — the holds are an internal billing mechanism the
-- anon/authenticated clients must never read or write directly).
alter table public.wallet_processing_holds enable row level security;

-- ---- reserve -------------------------------------------------------------
-- Atomically reserve funds for a batch of calls. p_calls is a JSON array of
-- {call_id, amount_cents}. Returns true if every (un-held) call is now
-- reserved, false if the available balance can't cover the new reservations
-- (in which case NOTHING is inserted). Idempotent: calls that already hold an
-- open reservation need no new funds and are left as-is.
create or replace function public.reserve_calls_for_processing(
  p_organization_id uuid,
  p_billing_account_id uuid,
  p_calls jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_settled integer;
  v_open_holds integer;
  v_available integer;
  v_needed integer;
begin
  if p_calls is null or jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) = 0 then
    return false;
  end if;

  -- Serialize concurrent reservations for this account so two batches can't
  -- both pass the available-balance check on the same funds.
  perform 1
  from public.billing_accounts
  where id = p_billing_account_id
    and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'billing account % not found for organization %', p_billing_account_id, p_organization_id;
  end if;

  -- Funds NEEDED = sum of amounts for requested calls that do NOT already hold
  -- an open reservation (those are already covered by an existing hold).
  select coalesce(sum(greatest((elem->>'amount_cents')::integer, 0)), 0)
  into v_needed
  from jsonb_array_elements(p_calls) as elem
  where not exists (
    select 1
    from public.wallet_processing_holds h
    where h.organization_id = p_organization_id
      and h.call_id = (elem->>'call_id')::uuid
      and h.status = 'open'
  );

  -- Nothing new to reserve (all already held, or all zero-cost) → success.
  if v_needed <= 0 then
    return true;
  end if;

  select balance_after_cents into v_settled
  from public.wallet_ledger_entries
  where organization_id = p_organization_id
  order by seq desc
  limit 1;
  v_settled := coalesce(v_settled, 0);

  select coalesce(sum(amount_cents), 0) into v_open_holds
  from public.wallet_processing_holds
  where organization_id = p_organization_id
    and status = 'open'
    and expires_at > now();

  v_available := v_settled - v_open_holds;

  if v_available < v_needed then
    return false;
  end if;

  insert into public.wallet_processing_holds (
    organization_id, billing_account_id, call_id, amount_cents, status, expires_at
  )
  select
    p_organization_id,
    p_billing_account_id,
    (elem->>'call_id')::uuid,
    greatest((elem->>'amount_cents')::integer, 0),
    'open',
    now() + interval '1 hour'
  from jsonb_array_elements(p_calls) as elem
  on conflict (organization_id, call_id) where status = 'open' do nothing;

  return true;
end;
$$;

revoke execute on function public.reserve_calls_for_processing(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_calls_for_processing(uuid, uuid, jsonb) to service_role;

-- ---- release -------------------------------------------------------------
-- Release a call's open hold (terminal job failure / no-media skip). Idempotent.
create or replace function public.release_call_processing_hold(
  p_organization_id uuid,
  p_call_id uuid
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.wallet_processing_holds
  set status = 'released', updated_at = now()
  where organization_id = p_organization_id
    and call_id = p_call_id
    and status = 'open';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.release_call_processing_hold(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_call_processing_hold(uuid, uuid) to service_role;

-- ---- sweep ---------------------------------------------------------------
-- Release every expired open hold. Safety net for jobs that vanished without
-- settling or releasing. Returns the number of holds released.
create or replace function public.sweep_expired_processing_holds()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.wallet_processing_holds
  set status = 'released', updated_at = now()
  where status = 'open'
    and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.sweep_expired_processing_holds() from public, anon, authenticated;
grant execute on function public.sweep_expired_processing_holds() to service_role;

-- ---- debit: settle the hold ----------------------------------------------
-- Recreate apply_call_processing_debit (0017 body, seq-ordered balance) so that
-- a successful debit also SETTLES the matching open hold. CREATE OR REPLACE
-- preserves grants; re-asserted below for clarity.
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

  -- Settle the reservation this debit corresponds to (no-op if none open).
  update public.wallet_processing_holds
  set status = 'settled', updated_at = now()
  where organization_id = p_organization_id
    and call_id = p_call_id
    and status = 'open';

  return true;
end;
$$;

revoke execute on function public.apply_call_processing_debit(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_call_processing_debit(uuid, uuid, uuid, integer) to service_role;
