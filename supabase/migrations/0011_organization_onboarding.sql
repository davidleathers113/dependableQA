begin;

-- Tighten organization onboarding.
--
-- The previous `organizations_insert_authenticated` policy used WITH CHECK
-- (true), letting any authenticated user insert arbitrary organization rows
-- directly via the RLS client / PostgREST. The app never relied on it —
-- onboarding runs server-side through the service-role admin client
-- (createOrganizationForUser), which bypasses RLS — so dropping the policy
-- closes the hole without changing the active onboarding path.
drop policy if exists "organizations_insert_authenticated" on public.organizations;

-- Sanctioned, transactional, client-callable onboarding primitive: creates the
-- organization and the caller's owner membership atomically. SECURITY DEFINER
-- so it can write past the now-removed insert policy, but it always assigns
-- ownership to auth.uid() (never a caller-supplied user), so it cannot be used
-- to mint an org owned by someone else. search_path is pinned empty and every
-- object is schema-qualified (advisor-safe; no mutable search_path).
create or replace function public.create_organization_with_owner(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_counter integer := 1;
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'must be authenticated to create an organization' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'organization name is required' using errcode = '22023';
  end if;

  -- Regex-free slug: lowercase, map spaces/underscores to hyphens. Uniqueness
  -- collisions are resolved by the suffix loop below.
  v_base := coalesce(nullif(lower(translate(v_name, ' _', '--')), ''), 'organization');
  v_slug := v_base;

  loop
    begin
      insert into public.organizations (name, slug)
      values (v_name, v_slug)
      returning * into v_org;
      exit;
    exception
      when unique_violation then
        v_counter := v_counter + 1;
        v_slug := v_base || '-' || v_counter;
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role, invite_status)
  values (v_org.id, v_uid, 'owner', 'accepted');

  return v_org;
end;
$$;

revoke execute on function public.create_organization_with_owner(text) from public, anon;
grant execute on function public.create_organization_with_owner(text) to authenticated;

commit;
