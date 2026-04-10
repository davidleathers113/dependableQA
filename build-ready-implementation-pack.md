Below is the build-ready implementation pack.

I based this on the current ConvoQC structure you shared plus the Netlify Astro Supabase starter you chose. The starter is intentionally minimal: Astro + Netlify adapter + Tailwind v4 + Supabase JS, with a simple Astro layout and a single `src/utils/database.ts` helper. That is a good foundation, but for this product you should expand it into an SSR app shell with React islands, a proper domain-driven `src/features/*` structure, and separate browser/server/admin Supabase clients.

One important starter change: the template currently uses `SUPABASE_DATABASE_URL` and `SUPABASE_ANON_KEY` from a server-side helper. Because your rebuilt app will use client-side React islands for tables, drawers, filters, and forms, switch to `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` for the browser client, and keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

---

# 0. Immediate repo changes

Install these before anything else:

```bash
npm i react react-dom @astrojs/react @supabase/ssr @tanstack/react-query @tanstack/react-table react-hook-form zod stripe lucide-react clsx tailwind-merge class-variance-authority
```

Update `astro.config.ts` to include React integration alongside the existing Netlify adapter and Tailwind Vite plugin. The starter already uses the Netlify adapter and Tailwind Vite, so this is an additive change, not a rewrite.

Recommended env contract:

```bash
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PLATFORM_PRICE_ID=

APP_URL=
NETLIFY_SITE_URL=

DEFAULT_RECHARGE_THRESHOLD_CENTS=2000
DEFAULT_RECHARGE_AMOUNT_CENTS=5000
DEFAULT_PER_MINUTE_RATE_CENTS=2

APP_ENCRYPTION_KEY=
```

---

# 1. Supabase migration pack

## `supabase/migrations/0001_core_identity.sql`

```sql
begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  create type public.organization_role as enum ('owner', 'admin', 'reviewer', 'analyst', 'billing');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.integration_provider as enum ('ringba', 'retreaver', 'trackdrive', 'custom');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.integration_status as enum ('connected', 'degraded', 'error', 'disconnected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.source_kind as enum ('csv', 'webhook', 'api', 'pixel');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.import_batch_status as enum ('uploaded', 'validating', 'processing', 'completed', 'partial', 'failed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.call_review_status as enum ('unreviewed', 'in_review', 'reviewed', 'reopened');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  invite_email citext,
  role public.organization_role not null,
  invite_status text not null default 'accepted' check (invite_status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_user_or_invite check (
    user_id is not null or invite_email is not null
  ),
  constraint organization_members_unique_user unique (organization_id, user_id),
  constraint organization_members_unique_invite unique (organization_id, invite_email)
);

create index if not exists idx_organization_members_org on public.organization_members (organization_id);
create index if not exists idx_organization_members_user on public.organization_members (user_id);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger set_organization_members_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.invite_status = 'accepted'
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.invite_status = 'accepted'
      and om.role = any(allowed_roles)
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated;

commit;
```

---

## `supabase/migrations/0002_operations.sql`

```sql
begin;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider public.integration_provider not null,
  display_name text not null,
  status public.integration_status not null default 'disconnected',
  mode public.source_kind not null default 'csv',
  config jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_unique_display unique (organization_id, provider, display_name)
);

create trigger set_integrations_updated_at
before update on public.integrations
for each row execute function public.set_updated_at();

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_events_org_integration_created
on public.integration_events (organization_id, integration_id, created_at desc);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  source_provider public.integration_provider not null,
  source_kind public.source_kind not null default 'csv',
  uploaded_by uuid references public.profiles(id) on delete set null,
  filename text not null,
  storage_path text not null,
  status public.import_batch_status not null default 'uploaded',
  row_count_total integer not null default 0 check (row_count_total >= 0),
  row_count_accepted integer not null default 0 check (row_count_accepted >= 0),
  row_count_rejected integer not null default 0 check (row_count_rejected >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_import_batches_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create index if not exists idx_import_batches_org_created
on public.import_batches (organization_id, created_at desc);

create table if not exists public.import_row_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  error_code text not null,
  error_message text not null,
  raw_row jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_row_errors_batch
on public.import_row_errors (import_batch_id, row_number);

create table if not exists public.publishers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  external_refs jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishers_unique_name unique (organization_id, normalized_name)
);

create trigger set_publishers_updated_at
before update on public.publishers
for each row execute function public.set_updated_at();

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  external_refs jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_unique_name unique (organization_id, normalized_name)
);

create trigger set_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  integration_id uuid references public.integrations(id) on delete set null,
  publisher_id uuid references public.publishers(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  external_call_id text,
  dedupe_hash text,
  caller_number text not null,
  destination_number text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  recording_url text,
  recording_storage_path text,
  source_provider public.integration_provider not null,
  source_status text not null default 'received',
  current_disposition text,
  current_review_status public.call_review_status not null default 'unreviewed',
  has_flags boolean not null default false,
  flag_count integer not null default 0 check (flag_count >= 0),
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'processing', 'completed', 'failed')),
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(caller_number, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(current_disposition, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(external_call_id, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calls_unique_external unique (organization_id, source_provider, external_call_id),
  constraint calls_unique_dedupe unique (organization_id, dedupe_hash)
);

create trigger set_calls_updated_at
before update on public.calls
for each row execute function public.set_updated_at();

create index if not exists idx_calls_org_started
on public.calls (organization_id, started_at desc);

create index if not exists idx_calls_org_review_status
on public.calls (organization_id, current_review_status);

create index if not exists idx_calls_org_publisher
on public.calls (organization_id, publisher_id);

create index if not exists idx_calls_org_campaign
on public.calls (organization_id, campaign_id);

create index if not exists idx_calls_org_disposition
on public.calls (organization_id, current_disposition);

create index if not exists idx_calls_search_document
on public.calls using gin (search_document);

create table if not exists public.call_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  source_provider public.integration_provider not null,
  source_kind public.source_kind not null,
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  mapping_version text not null default 'v1',
  created_at timestamptz not null default now()
);

create index if not exists idx_call_source_snapshots_call
on public.call_source_snapshots (call_id, created_at desc);

create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null unique references public.calls(id) on delete cascade,
  transcript_text text not null,
  transcript_segments jsonb not null default '[]'::jsonb,
  language text not null default 'en',
  confidence numeric(5,4),
  search_document tsvector generated always as (
    to_tsvector('english', coalesce(transcript_text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_call_transcripts_updated_at
before update on public.call_transcripts
for each row execute function public.set_updated_at();

create index if not exists idx_call_transcripts_search_document
on public.call_transcripts using gin (search_document);

create table if not exists public.call_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  analysis_version text not null,
  model_name text not null,
  summary text,
  disposition_suggested text,
  confidence numeric(5,4),
  flag_summary jsonb not null default '[]'::jsonb,
  structured_output jsonb not null default '{}'::jsonb,
  processing_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_analyses_call_created
on public.call_analyses (call_id, created_at desc);

create table if not exists public.call_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  flag_type text not null,
  flag_category text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'dismissed', 'confirmed')),
  source text not null check (source in ('ai', 'rule', 'manual')),
  title text not null,
  description text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_call_flags_updated_at
before update on public.call_flags
for each row execute function public.set_updated_at();

create index if not exists idx_call_flags_call
on public.call_flags (call_id, created_at desc);

create index if not exists idx_call_flags_org_status
on public.call_flags (organization_id, status, severity);

create table if not exists public.call_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  review_status public.call_review_status not null,
  final_disposition text,
  review_notes text,
  resolved_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_reviews_call_created
on public.call_reviews (call_id, created_at desc);

create table if not exists public.disposition_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  previous_disposition text,
  new_disposition text not null,
  reason text not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_disposition_overrides_call_created
on public.disposition_overrides (call_id, created_at desc);

create or replace function public.sync_call_flag_summary()
returns trigger
language plpgsql
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

drop trigger if exists trg_sync_call_flag_summary_insert on public.call_flags;
create trigger trg_sync_call_flag_summary_insert
after insert or update or delete on public.call_flags
for each row execute function public.sync_call_flag_summary();

commit;
```

---

## `supabase/migrations/0003_settings_billing_audit.sql`

```sql
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
```

---

## `supabase/migrations/0004_rls.sql`

```sql
begin;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_events enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_row_errors enable row level security;
alter table public.publishers enable row level security;
alter table public.campaigns enable row level security;
alter table public.calls enable row level security;
alter table public.call_source_snapshots enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.call_analyses enable row level security;
alter table public.call_flags enable row level security;
alter table public.call_reviews enable row level security;
alter table public.disposition_overrides enable row level security;
alter table public.saved_views enable row level security;
alter table public.alert_rules enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.wallet_ledger_entries enable row level security;
alter table public.api_keys enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- organizations
create policy "organizations_select_member"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

create policy "organizations_insert_authenticated"
on public.organizations
for insert
to authenticated
with check (true);

create policy "organizations_update_owner_admin"
on public.organizations
for update
to authenticated
using (public.has_org_role(id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(id, array['owner','admin']::public.organization_role[]));

-- organization_members
create policy "organization_members_select_member"
on public.organization_members
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "organization_members_insert_owner_admin"
on public.organization_members
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy "organization_members_update_owner_admin"
on public.organization_members
for update
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy "organization_members_delete_owner_admin"
on public.organization_members
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

-- integrations
create policy "integrations_select_member"
on public.integrations
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "integrations_manage_owner_admin"
on public.integrations
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

-- integration_events
create policy "integration_events_select_member"
on public.integration_events
for select
to authenticated
using (public.is_org_member(organization_id));

-- import_batches
create policy "import_batches_select_member"
on public.import_batches
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "import_batches_manage_owner_admin_reviewer"
on public.import_batches
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[]));

-- import_row_errors
create policy "import_row_errors_select_member"
on public.import_row_errors
for select
to authenticated
using (public.is_org_member(organization_id));

-- publishers
create policy "publishers_select_member"
on public.publishers
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "publishers_manage_owner_admin"
on public.publishers
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

-- campaigns
create policy "campaigns_select_member"
on public.campaigns
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "campaigns_manage_owner_admin"
on public.campaigns
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

-- calls
create policy "calls_select_member"
on public.calls
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "calls_update_owner_admin_reviewer"
on public.calls
for update
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[]));

-- call_source_snapshots
create policy "call_source_snapshots_select_member"
on public.call_source_snapshots
for select
to authenticated
using (public.is_org_member(organization_id));

-- call_transcripts
create policy "call_transcripts_select_member"
on public.call_transcripts
for select
to authenticated
using (public.is_org_member(organization_id));

-- call_analyses
create policy "call_analyses_select_member"
on public.call_analyses
for select
to authenticated
using (public.is_org_member(organization_id));

-- call_flags
create policy "call_flags_select_member"
on public.call_flags
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "call_flags_manage_owner_admin_reviewer"
on public.call_flags
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[]));

-- call_reviews
create policy "call_reviews_select_member"
on public.call_reviews
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "call_reviews_insert_owner_admin_reviewer"
on public.call_reviews
for insert
to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[])
  and reviewed_by = auth.uid()
);

-- disposition_overrides
create policy "disposition_overrides_select_member"
on public.disposition_overrides
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "disposition_overrides_insert_owner_admin_reviewer"
on public.disposition_overrides
for insert
to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[])
  and changed_by = auth.uid()
);

-- saved_views
create policy "saved_views_select_member"
on public.saved_views
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "saved_views_insert_self"
on public.saved_views
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and user_id = auth.uid()
);

create policy "saved_views_update_self"
on public.saved_views
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "saved_views_delete_self"
on public.saved_views
for delete
to authenticated
using (user_id = auth.uid());

-- alert_rules
create policy "alert_rules_select_member"
on public.alert_rules
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "alert_rules_manage_owner_admin"
on public.alert_rules
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

-- notification_deliveries
create policy "notification_deliveries_select_member"
on public.notification_deliveries
for select
to authenticated
using (public.is_org_member(organization_id));

-- billing_accounts
create policy "billing_accounts_select_member"
on public.billing_accounts
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "billing_accounts_manage_owner_admin_billing"
on public.billing_accounts
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','billing']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','billing']::public.organization_role[]));

-- wallet_ledger_entries
create policy "wallet_ledger_entries_select_member"
on public.wallet_ledger_entries
for select
to authenticated
using (public.is_org_member(organization_id));

-- api_keys
create policy "api_keys_select_owner_admin"
on public.api_keys
for select
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy "api_keys_manage_owner_admin"
on public.api_keys
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

-- audit_logs
create policy "audit_logs_select_member"
on public.audit_logs
for select
to authenticated
using (public.is_org_member(organization_id));

commit;
```

---

## `supabase/migrations/0005_storage.sql`

Use the convention: every object path begins with the org ID.

Examples:

* `imports/{org_id}/{batch_id}/source.csv`
* `recordings/{org_id}/{call_id}.mp3`
* `exports/{org_id}/calls-2026-04-10.csv`

```sql
begin;

insert into storage.buckets (id, name, public)
values
  ('imports', 'imports', false),
  ('recordings', 'recordings', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "imports_read_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'imports'
  and public.is_org_member((storage.foldername(name))[2]::uuid)
);

create policy "imports_write_owner_admin_reviewer"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'imports'
  and public.has_org_role((storage.foldername(name))[2]::uuid, array['owner','admin','reviewer']::public.organization_role[])
);

create policy "exports_read_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exports'
  and public.is_org_member((storage.foldername(name))[2]::uuid)
);

create policy "exports_write_member"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exports'
  and public.is_org_member((storage.foldername(name))[2]::uuid)
);

create policy "recordings_read_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recordings'
  and public.is_org_member((storage.foldername(name))[2]::uuid)
);

commit;
```

---

# 2. Route-by-route Astro page stubs

These are intentionally thin. Astro owns routing and auth gating. React owns interactivity.

## `src/pages/app/index.astro`

```astro
---
return Astro.redirect('/app/overview');
---
```

## `src/pages/app/overview.astro`

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import OverviewPage from '../../features/overview/OverviewPage';
import { requireAppSession } from '../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Overview" session={session}>
  <OverviewPage
    client:load
    organizationId={session.organization.id}
    userId={session.user.id}
  />
</AppLayout>
```

## `src/pages/app/calls/index.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import CallsPage from '../../../features/calls/CallsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Calls" session={session}>
  <CallsPage
    client:load
    organizationId={session.organization.id}
    userId={session.user.id}
  />
</AppLayout>
```

## `src/pages/app/calls/[callId].astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import CallDetailPage from '../../../features/calls/CallDetailPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
const { callId } = Astro.params;
---
<AppLayout title="Call Detail" session={session}>
  <CallDetailPage
    client:load
    organizationId={session.organization.id}
    callId={callId!}
  />
</AppLayout>
```

## `src/pages/app/imports/index.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import ImportsPage from '../../../features/imports/ImportsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Imports" session={session}>
  <ImportsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/imports/[batchId].astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import ImportBatchDetailPage from '../../../features/imports/ImportBatchDetailPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
const { batchId } = Astro.params;
---
<AppLayout title="Import Batch" session={session}>
  <ImportBatchDetailPage
    client:load
    organizationId={session.organization.id}
    batchId={batchId!}
  />
</AppLayout>
```

## `src/pages/app/integrations.astro`

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import IntegrationsPage from '../../features/integrations/IntegrationsPage';
import { requireAppSession } from '../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Integrations" session={session}>
  <IntegrationsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/reports.astro`

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import ReportsPage from '../../features/reports/ReportsPage';
import { requireAppSession } from '../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Reports" session={session}>
  <ReportsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/billing.astro`

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import BillingPage from '../../features/billing/BillingPage';
import { requireAppSession } from '../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Billing" session={session}>
  <BillingPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/ai.astro`

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import AiPage from '../../features/ai/AiPage';
import { requireAppSession } from '../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Ask AI" session={session}>
  <AiPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/updates.astro`

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import UpdatesPage from '../../features/updates/UpdatesPage';
import { requireAppSession } from '../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Updates" session={session}>
  <UpdatesPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/settings/profile.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import ProfileSettingsPage from '../../../features/settings/ProfileSettingsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Profile Settings" session={session}>
  <ProfileSettingsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/settings/team.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import TeamSettingsPage from '../../../features/settings/TeamSettingsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Team Settings" session={session}>
  <TeamSettingsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/settings/alerts.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import AlertSettingsPage from '../../../features/settings/AlertSettingsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Alert Settings" session={session}>
  <AlertSettingsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/settings/organization.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import OrganizationSettingsPage from '../../../features/settings/OrganizationSettingsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="Organization Settings" session={session}>
  <OrganizationSettingsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

## `src/pages/app/settings/api.astro`

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import ApiSettingsPage from '../../../features/settings/ApiSettingsPage';
import { requireAppSession } from '../../../lib/auth/require-app-session';

const session = await requireAppSession(Astro);
---
<AppLayout title="API Settings" session={session}>
  <ApiSettingsPage client:load organizationId={session.organization.id} />
</AppLayout>
```

---

# 3. Core layout and auth scaffolds

## `src/layouts/AppLayout.astro`

```astro
---
import '../styles/globals.css';
import AppShell from '../components/app-shell/AppShell';

interface SessionPayload {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

interface Props {
  title: string;
  session: SessionPayload;
}

const { title, session } = Astro.props;
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · ConvoOps</title>
  </head>
  <body class="min-h-screen bg-slate-950 text-slate-100 antialiased">
    <AppShell title={title} session={session}>
      <slot />
    </AppShell>
  </body>
</html>
```

## `src/lib/auth/require-app-session.ts`

```ts
export interface AppSession {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

/**
 * Replace this stub with a Supabase SSR implementation.
 * Responsibilities:
 * 1. Read the authenticated user from Supabase auth.
 * 2. Resolve the user's active organization membership.
 * 3. Redirect unauthenticated users to /login.
 * 4. Redirect users without org membership to an onboarding flow.
 */
export async function requireAppSession(_Astro: unknown): Promise<AppSession> {
  throw new Error('Implement requireAppSession with @supabase/ssr before shipping.');
}
```

---

# 4. React component scaffolds

## `src/types/domain.ts`

```ts
export type ReviewStatus = 'unreviewed' | 'in_review' | 'reviewed' | 'reopened';

export interface CallListItem {
  id: string;
  callerNumber: string;
  startedAt: string;
  durationSeconds: number;
  campaignName: string | null;
  publisherName: string | null;
  currentDisposition: string | null;
  currentReviewStatus: ReviewStatus;
  flagCount: number;
  topFlag: string | null;
  sourceProvider: 'ringba' | 'retreaver' | 'trackdrive' | 'custom';
  importBatchId: string | null;
}

export interface CallDetail extends CallListItem {
  destinationNumber: string | null;
  endedAt: string | null;
  transcriptText: string | null;
  analysisSummary: string | null;
  suggestedDisposition: string | null;
  analysisConfidence: number | null;
  flags: Array<{
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'dismissed' | 'confirmed';
    description: string | null;
  }>;
}
```

## `src/features/calls/CallsPage.tsx`

```tsx
import * as React from 'react';
import { CallsToolbar } from './components/CallsToolbar';
import { CallsTable } from './components/CallsTable';
import { CallDetailDrawer } from './components/CallDetailDrawer';
import type { CallListItem } from '../../types/domain';

interface Props {
  organizationId: string;
  userId: string;
}

export default function CallsPage({ organizationId }: Props) {
  const [selectedCallId, setSelectedCallId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<CallListItem[]>([]);

  React.useEffect(() => {
    // TODO: replace with TanStack Query + server-backed filters
    void organizationId;
    setRows([]);
  }, [organizationId]);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-slate-400">
            Search, review, and audit AI-classified calls.
          </p>
        </div>
      </header>

      <CallsToolbar organizationId={organizationId} />

      <CallsTable
        rows={rows}
        onRowClick={(row) => setSelectedCallId(row.id)}
      />

      <CallDetailDrawer
        organizationId={organizationId}
        callId={selectedCallId}
        open={Boolean(selectedCallId)}
        onOpenChange={(open) => {
          if (!open) setSelectedCallId(null);
        }}
      />
    </section>
  );
}
```

## `src/features/calls/components/CallsToolbar.tsx`

```tsx
interface Props {
  organizationId: string;
}

export function CallsToolbar({ organizationId }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none"
          placeholder="Search calls, transcripts, flags, campaigns..."
        />
        <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm">Date Range</button>
        <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm">Filters</button>
        <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm">Columns</button>
        <button className="h-10 rounded-xl bg-violet-500 px-4 text-sm font-medium text-white">
          Import Calls
        </button>
      </div>
      <div className="mt-3 text-xs text-slate-500">Org: {organizationId}</div>
    </div>
  );
}
```

## `src/features/calls/components/CallsTable.tsx`

```tsx
import type { CallListItem } from '../../../types/domain';

interface Props {
  rows: CallListItem[];
  onRowClick: (row: CallListItem) => void;
}

export function CallsTable({ rows, onRowClick }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950/60 text-slate-400">
            <tr>
              <th className="px-4 py-3">Date/Time</th>
              <th className="px-4 py-3">Caller Number</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Publisher</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Disposition</th>
              <th className="px-4 py-3">Review</th>
              <th className="px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  No calls yet. Import a batch or connect an integration.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/40"
                  onClick={() => onRowClick(row)}
                >
                  <td className="px-4 py-3">{row.startedAt}</td>
                  <td className="px-4 py-3">{row.callerNumber}</td>
                  <td className="px-4 py-3">{row.campaignName ?? '—'}</td>
                  <td className="px-4 py-3">{row.publisherName ?? '—'}</td>
                  <td className="px-4 py-3">{row.durationSeconds}s</td>
                  <td className="px-4 py-3">{row.currentDisposition ?? '—'}</td>
                  <td className="px-4 py-3">{row.currentReviewStatus}</td>
                  <td className="px-4 py-3">{row.flagCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## `src/features/calls/components/CallDetailDrawer.tsx`

```tsx
import * as React from 'react';

interface Props {
  organizationId: string;
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallDetailDrawer({ callId, open, onOpenChange }: Props) {
  if (!open || !callId) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-800 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Call Detail</h2>
          <p className="text-xs text-slate-400">Call ID: {callId}</p>
        </div>
        <button
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>

      <div className="space-y-6 p-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-2 text-sm font-medium">Overview</h3>
          <p className="text-sm text-slate-400">
            TODO: load call metadata, transcript, flags, audit timeline, and review actions.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-medium text-white">
            Confirm Disposition
          </button>
          <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm">
            Override Disposition
          </button>
          <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm">
            Dismiss Flags
          </button>
          <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm">
            Re-run Analysis
          </button>
        </section>
      </div>
    </div>
  );
}
```

## `src/features/imports/ImportsPage.tsx`

```tsx
interface Props {
  organizationId: string;
}

export default function ImportsPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="text-sm text-slate-400">
          Upload CSVs, inspect validation results, and track batch processing.
        </p>
      </header>

      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-8 text-center">
        <p className="text-sm text-slate-300">Drop CSV here or browse</p>
        <p className="mt-2 text-xs text-slate-500">TrackDrive, Ringba, Retreaver, or custom CSV</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-medium">Recent Batches</h2>
        <p className="text-sm text-slate-500">TODO: render import batch table for {organizationId}</p>
      </div>
    </section>
  );
}
```

## `src/features/integrations/IntegrationsPage.tsx`

```tsx
interface Props {
  organizationId: string;
}

export default function IntegrationsPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-slate-400">
          Connect providers, verify health, and inspect ingest events.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {['TrackDrive', 'Ringba', 'Retreaver'].map((name) => (
          <div key={name} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{name}</h2>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400">
                disconnected
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">TODO: show last success, last error, setup status.</p>
            <button className="mt-4 rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white">
              Configure
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
```

## `src/features/billing/BillingPage.tsx`

```tsx
interface Props {
  organizationId: string;
}

export default function BillingPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-slate-400">
          Manage recharge settings, payment methods, and usage ledger.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-medium">Current Balance</h2>
          <p className="mt-2 text-3xl font-semibold">$0.00</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-medium">Recharge Threshold</h2>
          <p className="mt-2 text-3xl font-semibold">$20.00</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-medium">Recharge Amount</h2>
          <p className="mt-2 text-3xl font-semibold">$50.00</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm text-slate-500">TODO: usage ledger, invoices, Stripe customer portal.</p>
      </div>
    </section>
  );
}
```

---

# 5. Supabase client scaffolds

## `src/lib/supabase/browser-client.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types';

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getBrowserSupabase() {
  if (!client) {
    client = createClient<Database>(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }

  return client;
}
```

## `src/lib/supabase/admin-client.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types';

export function getAdminSupabase() {
  return createClient<Database>(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
```

---

# 6. Stripe + Netlify function contracts

These are the minimum server contracts I would ship first.

## `netlify/functions/create-portal-session.ts`

```ts
import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { z } from 'zod';
import { getAdminSupabase } from '../../src/lib/supabase/admin-client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const BodySchema = z.object({
  organizationId: z.string().uuid(),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const body = BodySchema.parse(JSON.parse(event.body ?? '{}'));
  const supabase = getAdminSupabase();

  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_customer_id')
    .eq('organization_id', body.organizationId)
    .single();

  if (!billing?.stripe_customer_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No Stripe customer found.' }) };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${process.env.APP_URL}/app/billing`,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url }),
  };
};
```

## `netlify/functions/create-recharge-payment-intent.ts`

```ts
import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { z } from 'zod';
import { getAdminSupabase } from '../../src/lib/supabase/admin-client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const BodySchema = z.object({
  organizationId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const body = BodySchema.parse(JSON.parse(event.body ?? '{}'));
  const supabase = getAdminSupabase();

  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_customer_id,currency')
    .eq('organization_id', body.organizationId)
    .single();

  if (!billing?.stripe_customer_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No Stripe customer found.' }) };
  }

  const intent = await stripe.paymentIntents.create({
    amount: body.amountCents,
    currency: billing.currency ?? 'usd',
    customer: billing.stripe_customer_id,
    automatic_payment_methods: { enabled: true },
    metadata: {
      organization_id: body.organizationId,
      type: 'manual_recharge',
    },
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    }),
  };
};
```

## `netlify/functions/stripe-webhook.ts`

```ts
import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { getAdminSupabase } from '../../src/lib/supabase/admin-client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const handler: Handler = async (event) => {
  const signature = event.headers['stripe-signature'] ?? event.headers['Stripe-Signature'];

  if (!signature || !event.body) {
    return { statusCode: 400, body: 'Missing Stripe signature or body.' };
  }

  let stripeEvent: Stripe.Event;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    return { statusCode: 400, body: `Webhook Error: ${(error as Error).message}` };
  }

  const supabase = getAdminSupabase();

  switch (stripeEvent.type) {
    case 'payment_intent.succeeded': {
      const intent = stripeEvent.data.object as Stripe.PaymentIntent;
      const organizationId = intent.metadata.organization_id;
      if (!organizationId) break;

      const { data: billing } = await supabase
        .from('billing_accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .single();

      if (billing) {
        const { data: latestBalance } = await supabase
          .from('wallet_ledger_entries')
          .select('balance_after_cents')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const balanceAfter = (latestBalance?.balance_after_cents ?? 0) + intent.amount;

        await supabase.from('wallet_ledger_entries').insert({
          organization_id: organizationId,
          billing_account_id: billing.id,
          entry_type: 'recharge',
          amount_cents: intent.amount,
          balance_after_cents: balanceAfter,
          reference_type: 'stripe_payment_intent',
          description: `Stripe payment intent ${intent.id}`,
        });
      }

      break;
    }

    case 'payment_intent.payment_failed':
    case 'invoice.payment_failed':
    case 'invoice.paid':
    default:
      break;
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
```

## `netlify/functions/integration-ingest.ts`

```ts
import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabase } from '../../src/lib/supabase/admin-client';

const QuerySchema = z.object({
  provider: z.enum(['ringba', 'retreaver', 'trackdrive', 'custom']),
  organizationId: z.string().uuid(),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const query = QuerySchema.parse(event.queryStringParameters ?? {});
  const payload = JSON.parse(event.body ?? '{}');
  const supabase = getAdminSupabase();

  // 1. Validate signature/provider-specific auth here.
  // 2. Create integration_event.
  // 3. Normalize payload to a call draft.
  // 4. Upsert call by external_call_id or dedupe_hash.
  // 5. Insert call_source_snapshot.
  // 6. Enqueue transcript/analysis processing.

  await supabase.from('integration_events').insert({
    organization_id: query.organizationId,
    integration_id: null,
    event_type: 'ingest_received',
    severity: 'info',
    message: `Received ${query.provider} payload`,
    payload,
  });

  return {
    statusCode: 202,
    body: JSON.stringify({
      accepted: true,
      provider: query.provider,
      organizationId: query.organizationId,
    }),
  };
};
```

## `netlify/functions/import-dispatch.ts`

```ts
import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabase } from '../../src/lib/supabase/admin-client';

const BodySchema = z.object({
  batchId: z.string().uuid(),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const body = BodySchema.parse(JSON.parse(event.body ?? '{}'));
  const supabase = getAdminSupabase();

  const { data: batch } = await supabase
    .from('import_batches')
    .select('*')
    .eq('id', body.batchId)
    .single();

  if (!batch) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Batch not found' }) };
  }

  await supabase
    .from('import_batches')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', body.batchId);

  // TODO:
  // - download file from Storage
  // - parse CSV
  // - validate provider schema
  // - write import_row_errors
  // - upsert publishers/campaigns
  // - insert calls + source snapshots
  // - mark batch completed/partial/failed

  return {
    statusCode: 202,
    body: JSON.stringify({ accepted: true, batchId: body.batchId }),
  };
};
```

## `netlify/functions/alert-dispatch.ts`

```ts
import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabase } from '../../src/lib/supabase/admin-client';

const BodySchema = z.object({
  organizationId: z.string().uuid(),
  callId: z.string().uuid(),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const body = BodySchema.parse(JSON.parse(event.body ?? '{}'));
  const supabase = getAdminSupabase();

  // TODO:
  // 1. Load call + open flags
  // 2. Load enabled alert rules
  // 3. Match trigger config
  // 4. Send email/Slack/webhook
  // 5. Log notification_deliveries

  await supabase.from('notification_deliveries').insert({
    organization_id: body.organizationId,
    event_type: 'call_flagged',
    destination: 'pending',
    status: 'pending',
    payload: { callId: body.callId },
  });

  return {
    statusCode: 202,
    body: JSON.stringify({ accepted: true }),
  };
};
```

---

# 7. Minimal query contracts

These are the client-facing query shapes I would standardize now.

## Calls list query params

```ts
export interface CallsQuery {
  page: number;
  pageSize: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  publisherIds?: string[];
  campaignIds?: string[];
  dispositions?: string[];
  reviewStatuses?: Array<'unreviewed' | 'in_review' | 'reviewed' | 'reopened'>;
  severities?: Array<'low' | 'medium' | 'high' | 'critical'>;
  sourceProviders?: Array<'ringba' | 'retreaver' | 'trackdrive' | 'custom'>;
  importBatchId?: string;
  sortBy?: 'startedAt' | 'durationSeconds' | 'flagCount';
  sortDirection?: 'asc' | 'desc';
}
```

## Import batch response

```ts
export interface ImportBatchSummary {
  id: string;
  filename: string;
  sourceProvider: 'ringba' | 'retreaver' | 'trackdrive' | 'custom';
  status: 'uploaded' | 'validating' | 'processing' | 'completed' | 'partial' | 'failed' | 'archived';
  rowCountTotal: number;
  rowCountAccepted: number;
  rowCountRejected: number;
  createdAt: string;
}
```

## Billing summary response

```ts
export interface BillingSummary {
  currentBalanceCents: number;
  rechargeThresholdCents: number;
  rechargeAmountCents: number;
  perMinuteRateCents: number;
  autopayEnabled: boolean;
  lastRechargeAt: string | null;
  lastRechargeAmountCents: number | null;
}
```

---

# 8. Seed data recommendation

Create a `supabase/seed.sql` that inserts:

* 1 demo org
* 1 owner membership
* 3 integrations
* 4 publishers
* 5 campaigns
* 2 import batches
* 50 demo calls
* transcripts on 30 calls
* flags on 10 calls
* reviews on 12 calls
* billing account + 8 wallet ledger entries

That gives the UI enough data density to look real immediately.

---

# 9. Build order from this pack

Use this exact sequence:

1. Run migrations.
2. Add browser/admin Supabase clients.
3. Replace starter page structure with `app/*` route shell.
4. Build `AppLayout` and sidebar shell.
5. Implement calls list query + table.
6. Implement call detail drawer.
7. Implement import batch list + upload.
8. Wire `import-dispatch`.
9. Wire integrations ingest endpoint.
10. Wire billing summary + Stripe portal.
11. Wire wallet ledger and recharge flow.
12. Add alert rules + dispatch.
13. Add saved views and reporting.

---

# 10. What this pack intentionally does not fake

This pack gives you:

* exact SQL migrations
* exact RLS policy set
* concrete route shell
* concrete React scaffolds
* concrete Netlify function contracts

It does not pretend to give you:

* a complete compiled SSR auth implementation for Astro + Supabase
* fully polished UI primitives
* production CSV mapping logic
* production transcript/AI orchestration

Those are the next executable steps after the scaffold is in place.

The fastest continuation is generating the actual repo file set next: ready-to-paste files for `src/`, `supabase/migrations/`, and `netlify/functions/` with the remaining auth shell, design-system primitives, and initial data queries.
