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
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy "imports_write_owner_admin_reviewer"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'imports'
  and public.has_org_role((storage.foldername(name))[1]::uuid, array['owner','admin','reviewer']::public.organization_role[])
);

create policy "exports_read_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exports'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy "exports_write_member"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exports'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy "recordings_read_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recordings'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

commit;
