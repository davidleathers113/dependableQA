begin;

-- Ringba controlled full API import batches. Distinct from public.import_batches
-- (which is CSV-upload oriented: filename/storage_path, csv source_kind). A Ringba
-- API import has no file; it pulls call-log records for a date range with a hard
-- max-record cap and tracks how many rows were seen vs imported vs had recordings.
-- Status is a CHECK constraint (matches integration_events.severity style) rather
-- than a new enum to keep the schema surface small.
create table if not exists public.ringba_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  date_start timestamptz not null,
  date_end timestamptz not null,
  max_records integer not null check (max_records > 0),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_imported integer not null default 0 check (records_imported >= 0),
  recordings_imported integer not null default 0 check (recordings_imported >= 0),
  import_behavior text not null default 'import_only' check (
    import_behavior in ('import_only', 'review', 'analyze')
  ),
  status text not null default 'running' check (
    status in ('running', 'completed', 'partial', 'failed')
  ),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_ringba_import_batches_organization_id
on public.ringba_import_batches (organization_id, created_at desc);

create index if not exists idx_ringba_import_batches_integration_id
on public.ringba_import_batches (integration_id);

create index if not exists idx_ringba_import_batches_requested_by
on public.ringba_import_batches (requested_by);

alter table public.ringba_import_batches enable row level security;

create policy "ringba_import_batches_select_member"
on public.ringba_import_batches
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "ringba_import_batches_manage_owner_admin"
on public.ringba_import_batches
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

commit;
