begin;

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null default 'calls' check (entity_type in ('calls', 'imports', 'reports')),
  name text not null,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_views_unique_name unique (organization_id, user_id, entity_type, name)
);

create trigger set_saved_views_updated_at
before update on public.saved_views
for each row execute function public.set_updated_at();

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_enabled boolean not null default true,
  trigger_config jsonb not null default '{}'::jsonb,
  delivery_config jsonb not null default '{}'::jsonb,
  cooldown_minutes integer not null default 15 check (cooldown_minutes >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_alert_rules_updated_at
before update on public.alert_rules
for each row execute function public.set_updated_at();

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_rule_id uuid references public.alert_rules(id) on delete set null,
  event_type text not null,
  destination text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_deliveries_org_created
on public.notification_deliveries (organization_id, created_at desc);

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  billing_email citext,
  autopay_enabled boolean not null default true,
  recharge_threshold_cents integer not null default 2000 check (recharge_threshold_cents >= 0),
  recharge_amount_cents integer not null default 5000 check (recharge_amount_cents > 0),
  per_minute_rate_cents integer not null default 2 check (per_minute_rate_cents >= 0),
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_billing_accounts_updated_at
before update on public.billing_accounts
for each row execute function public.set_updated_at();

create table if not exists public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  entry_type text not null check (entry_type in ('credit', 'debit', 'recharge', 'adjustment', 'refund')),
  amount_cents integer not null,
  balance_after_cents integer not null,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_ledger_entries_account_created
on public.wallet_ledger_entries (billing_account_id, created_at desc);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  token_prefix text not null,
  token_hash text not null unique,
  scopes jsonb not null default '[]'::jsonb,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_org_created
on public.api_keys (organization_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_org_created
on public.audit_logs (organization_id, created_at desc);

commit;
