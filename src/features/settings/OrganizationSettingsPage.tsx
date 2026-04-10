import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  getOrganizationSettings,
  type OrganizationSettingsData,
  updateOrganizationSettings,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  initialData: OrganizationSettingsData;
}

function OrganizationSettingsPageInner({ organizationId, initialData }: Props) {
  const queryClient = useQueryClient();
  const organizationQuery = useQuery({
    queryKey: ["organization-settings", organizationId],
    queryFn: () => getOrganizationSettings(getBrowserSupabase(), organizationId),
    initialData,
  });
  const [name, setName] = React.useState(initialData.name);
  const [slug, setSlug] = React.useState(initialData.slug);
  const [timezone, setTimezone] = React.useState(initialData.timezone);
  const [billingEmail, setBillingEmail] = React.useState(initialData.billingEmail);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");

  React.useEffect(() => {
    setName(organizationQuery.data.name);
    setSlug(organizationQuery.data.slug);
    setTimezone(organizationQuery.data.timezone);
    setBillingEmail(organizationQuery.data.billingEmail);
  }, [
    organizationQuery.data.billingEmail,
    organizationQuery.data.name,
    organizationQuery.data.slug,
    organizationQuery.data.timezone,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      updateOrganizationSettings(getBrowserSupabase(), organizationId, {
        name,
        slug,
        timezone,
        billingEmail,
      }),
    onSuccess: async (data) => {
      setErrorMessage("");
      setSuccessMessage("Organization settings saved.");
      await queryClient.setQueryData(["organization-settings", organizationId], data);
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to update organization.");
    },
  });

  return (
    <section className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Organization Settings</h1>
        <p className="text-sm text-slate-400">Configure global workspace settings and billing contact details.</p>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
        {errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Organization Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="My Organization"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Organization Slug</label>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="my-organization"
            />
            <p className="text-[10px] text-slate-500">This is used in organization-specific URLs and integrations.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Timezone</label>
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="America/New_York"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Billing Contact Email</label>
            <input
              value={billingEmail}
              onChange={(event) => setBillingEmail(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="billing@company.com"
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-400">
            Current organization status: <span className="text-slate-200">{organizationQuery.data.status}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving..." : "Update Organization"}
        </button>
      </div>

      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-red-200">Danger Zone</h3>
        <p className="text-xs text-red-400/80">
          Organization deletion is intentionally disabled in-app until a full archival and offboarding workflow exists.
        </p>
        <button
          type="button"
          disabled
          className="rounded-lg border border-red-900/50 bg-red-900/20 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-500 opacity-60"
        >
          Delete Organization Disabled
        </button>
      </div>
    </section>
  );
}

export default function OrganizationSettingsPage(props: Props) {
  return (
    <QueryProvider>
      <OrganizationSettingsPageInner {...props} />
    </QueryProvider>
  );
}
