begin;

alter table public.call_flags
  add column if not exists start_seconds double precision,
  add column if not exists end_seconds double precision;

alter table public.call_flags
  add constraint call_flags_time_bounds check (
    (start_seconds is null or start_seconds >= 0)
    and (end_seconds is null or end_seconds >= 0)
    and (start_seconds is null or end_seconds is null or end_seconds >= start_seconds)
  );

create table if not exists public.call_review_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  start_seconds double precision not null check (start_seconds >= 0),
  end_seconds double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_review_notes_end_after_start check (
    end_seconds is null or end_seconds >= start_seconds
  )
);

create trigger set_call_review_notes_updated_at
before update on public.call_review_notes
for each row execute function public.set_updated_at();

create index if not exists idx_call_review_notes_call
on public.call_review_notes (call_id, created_at desc);

alter table public.call_review_notes enable row level security;

create policy "call_review_notes_select_member"
on public.call_review_notes
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "call_review_notes_insert_owner_admin_reviewer"
on public.call_review_notes
for insert
to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[])
  and created_by = auth.uid()
);

create policy "call_review_notes_update_owner_admin_reviewer_self"
on public.call_review_notes
for update
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[])
  and created_by = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[])
  and created_by = auth.uid()
);

create policy "call_review_notes_delete_owner_admin_reviewer_self"
on public.call_review_notes
for delete
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','reviewer']::public.organization_role[])
  and created_by = auth.uid()
);

commit;
