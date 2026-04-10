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
