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
