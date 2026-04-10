-- RLS Policies for Multi-tenancy

-- Helper function to check if user is a member of an organization
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: Users can only read/write their own profile
CREATE POLICY "Users can manage their own profile"
  ON public.profiles
  FOR ALL
  USING (auth.uid() = id);

-- Organizations: Members can read their organization
CREATE POLICY "Members can read their organization"
  ON public.organizations
  FOR SELECT
  USING (public.is_org_member(id));

-- Organization Members: Members can read other members in the same org
CREATE POLICY "Members can read other members in same org"
  ON public.organization_members
  FOR SELECT
  USING (public.is_org_member(organization_id));

-- Apply Organization-based RLS to all tenant tables
-- Format: "Members can manage [table] in their org"

CREATE POLICY "Members can manage integrations in their org"
  ON public.integrations FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read integration_events in their org"
  ON public.integration_events FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage import_batches in their org"
  ON public.import_batches FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read import_row_errors in their org"
  ON public.import_row_errors FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage publishers in their org"
  ON public.publishers FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage campaigns in their org"
  ON public.campaigns FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage calls in their org"
  ON public.calls FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read call_source_snapshots in their org"
  ON public.call_source_snapshots FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage call_transcripts in their org"
  ON public.call_transcripts FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage call_analyses in their org"
  ON public.call_analyses FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage call_flags in their org"
  ON public.call_flags FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage call_reviews in their org"
  ON public.call_reviews FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can manage disposition_overrides in their org"
  ON public.disposition_overrides FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Users can manage their own saved_views"
  ON public.saved_views FOR ALL USING (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "Members can manage alert_rules in their org"
  ON public.alert_rules FOR ALL USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read notification_deliveries in their org"
  ON public.notification_deliveries FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read billing_accounts in their org"
  ON public.billing_accounts FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read wallet_ledger_entries in their org"
  ON public.wallet_ledger_entries FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Members can read audit_logs in their org"
  ON public.audit_logs FOR SELECT USING (public.is_org_member(organization_id));
