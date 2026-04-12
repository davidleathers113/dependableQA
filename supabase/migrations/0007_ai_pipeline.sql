begin;

alter table public.calls
  drop constraint if exists calls_analysis_status_check;

alter table public.calls
  add column if not exists transcription_status text not null default 'pending' check (
    transcription_status in ('pending', 'queued', 'processing', 'completed', 'failed')
  ),
  add column if not exists transcription_started_at timestamptz,
  add column if not exists transcription_completed_at timestamptz,
  add column if not exists transcription_error text,
  add column if not exists analysis_started_at timestamptz,
  add column if not exists analysis_completed_at timestamptz,
  add column if not exists analysis_error text,
  add constraint calls_analysis_status_check check (
    analysis_status in ('pending', 'queued', 'processing', 'completed', 'failed')
  );

create index if not exists idx_calls_org_transcription_status
on public.calls (organization_id, transcription_status, started_at desc);

create index if not exists idx_calls_org_analysis_status
on public.calls (organization_id, analysis_status, started_at desc);

alter table public.call_transcripts
  add column if not exists provider text,
  add column if not exists model_name text,
  add column if not exists response_format text,
  add column if not exists duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  add column if not exists usage_json jsonb,
  add column if not exists raw_response_json jsonb,
  add column if not exists transcription_version text;

alter table public.call_analyses
  add column if not exists prompt_version text,
  add column if not exists schema_version text,
  add column if not exists usage_json jsonb,
  add column if not exists raw_response_json jsonb;

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  job_type text not null check (job_type in ('transcription', 'analysis')),
  status text not null default 'queued' check (
    status in ('queued', 'claimed', 'running', 'completed', 'failed', 'retry_scheduled', 'cancelled')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  priority integer not null default 100,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  lease_expires_at timestamptz,
  dedupe_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_jobs_unique_dedupe unique (organization_id, dedupe_key)
);

create trigger set_ai_jobs_updated_at
before update on public.ai_jobs
for each row execute function public.set_updated_at();

create index if not exists idx_ai_jobs_claim
on public.ai_jobs (status, scheduled_at, priority, created_at);

create index if not exists idx_ai_jobs_call
on public.ai_jobs (call_id, created_at desc);

alter table public.ai_jobs enable row level security;

commit;
