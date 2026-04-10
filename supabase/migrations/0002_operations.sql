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
