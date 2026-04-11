import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import type { IntegrationsSummary } from "../../lib/app-data";

interface Props {
  organizationId: string;
  currentUserRole: string;
  initialData: IntegrationsSummary;
}

async function fetchIntegrationsSummary() {
  const response = await fetch("/api/settings/integrations");
  const payload = (await response.json().catch(() => ({}))) as IntegrationsSummary & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load integrations.");
  }

  return payload;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string) {
  if (status === "connected") {
    return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  }

  if (status === "degraded") {
    return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  }

  if (status === "error") {
    return "text-red-300 border-red-500/30 bg-red-500/10";
  }

  return "text-slate-300 border-slate-700 bg-slate-800";
}

function eventTone(severity: string) {
  if (severity === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }

  if (severity === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  return "border-slate-800 bg-slate-950 text-slate-300";
}

interface IntegrationCardPanelProps {
  currentUserRole: string;
  integration: IntegrationsSummary["integrations"][number];
  organizationId: string;
}

function IntegrationCardPanel({ currentUserRole, integration, organizationId }: IntegrationCardPanelProps) {
  const queryClient = useQueryClient();
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const [authType, setAuthType] = React.useState(integration.webhookAuth.authType);
  const [headerName, setHeaderName] = React.useState(integration.webhookAuth.headerName);
  const [prefix, setPrefix] = React.useState(integration.webhookAuth.prefix);
  const [secret, setSecret] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");

  React.useEffect(() => {
    setAuthType(integration.webhookAuth.authType);
    setHeaderName(integration.webhookAuth.headerName);
    setPrefix(integration.webhookAuth.prefix);
    setSecret("");
  }, [integration.id, integration.webhookAuth.authType, integration.webhookAuth.headerName, integration.webhookAuth.prefix]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "update-webhook-auth",
          integrationId: integration.id,
          authType,
          headerName,
          prefix,
          secret,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update integration settings.");
      }
    },
    onSuccess: async () => {
      setErrorMessage("");
      setSuccessMessage("Integration settings saved.");
      setSecret("");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to update integration settings.");
    },
  });

  const authSummary =
    integration.webhookAuth.secretSource === "environment"
      ? "Using environment fallback secret."
      : integration.webhookAuth.secretConfigured
        ? "Integration-specific secret configured."
        : "No secret configured yet.";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 hover:border-slate-700 transition-colors">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-lg">
            🔌
          </div>
          <div>
            <h2 className="font-semibold text-white">{integration.displayName}</h2>
            <p className="text-xs uppercase tracking-wider text-slate-500">{integration.provider}</p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone(integration.status)}`}>
          {integration.status}
        </span>
      </div>

      <div className="grid gap-3 text-xs md:grid-cols-2">
        <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
          <span className="text-slate-500">Mode</span>
          <span className="text-slate-300">{integration.mode}</span>
        </div>
        <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
          <span className="text-slate-500">Last Success</span>
          <span className="text-slate-300">{formatDateTime(integration.lastSuccessAt)}</span>
        </div>
        <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
          <span className="text-slate-500">Last Error</span>
          <span className="text-slate-300">{formatDateTime(integration.lastErrorAt)}</span>
        </div>
        <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
          <span className="text-slate-500">Webhook Auth</span>
          <span className="text-slate-300">{integration.webhookAuth.secretConfigured ? "Configured" : "Missing"}</span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Webhook Settings</h3>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{integration.webhookAuth.authType}</span>
        </div>
        <p className="text-xs text-slate-400">{authSummary}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Auth Type</span>
            <select
              value={authType}
              onChange={(event) => setAuthType(event.target.value as typeof authType)}
              disabled={!canManage || updateMutation.isPending}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            >
              <option value="hmac-sha256">HMAC SHA-256</option>
              <option value="shared-secret">Shared Secret</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Header Name</span>
            <input
              value={headerName}
              onChange={(event) => setHeaderName(event.target.value)}
              disabled={!canManage || updateMutation.isPending}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prefix</span>
            <input
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              disabled={!canManage || updateMutation.isPending}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
              placeholder={authType === "hmac-sha256" ? "sha256=" : ""}
            />
          </label>
        </div>
        <label className="block space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Secret</span>
          <input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            disabled={!canManage || updateMutation.isPending}
            type="password"
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            placeholder="Enter a new secret to rotate it"
          />
        </label>
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-slate-500">
            Webhook endpoint: <span className="text-slate-300">`/.netlify/functions/integration-ingest`</span>
          </div>
          <button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={!canManage || updateMutation.isPending || headerName.trim().length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          >
            {updateMutation.isPending ? "Saving..." : "Save Webhook Settings"}
          </button>
        </div>
        {!canManage && (
          <p className="text-xs text-slate-500">Only owners and admins can edit integration settings.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Diagnostics</h3>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {integration.lastEventSeverity ?? "info"}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          {integration.lastEventMessage ?? "No webhook events recorded yet for this integration."}
        </p>
        {integration.recentEvents.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-500">
            No recent integration events available.
          </div>
        ) : (
          <div className="space-y-3">
            {integration.recentEvents.map((event) => (
              <div key={event.id} className={`rounded-xl border px-4 py-3 text-sm ${eventTone(event.severity)}`}>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{event.message}</span>
                  <span className="text-[10px] uppercase tracking-wider">{event.severity}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs opacity-80">
                  <span>{event.eventType}</span>
                  <span>{formatDateTime(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationsPageInner({ organizationId, currentUserRole, initialData }: Props) {
  const integrationsQuery = useQuery({
    queryKey: ["integrations", organizationId],
    queryFn: fetchIntegrationsSummary,
    initialData,
  });

  const integrations = integrationsQuery.data.integrations;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Integrations</h1>
        <p className="text-sm text-slate-400">
          Connect providers, manage webhook auth, and inspect ingest health.
        </p>
      </header>

      {integrationsQuery.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {integrationsQuery.error instanceof Error ? integrationsQuery.error.message : "Unable to load integrations."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {integrations.length === 0 ? (
          <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
            No integrations configured yet. Create records in Supabase or ingest your first webhook to populate this workspace.
          </div>
        ) : (
          integrations.map((integration) => (
            <div key={integration.id} className="lg:col-span-3">
              <IntegrationCardPanel
                integration={integration}
                organizationId={organizationId}
                currentUserRole={currentUserRole}
              />
            </div>
        )))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-400">
          Need a custom integration? Configure webhook auth here, then send signed provider payloads to
          <span className="text-violet-400"> `/.netlify/functions/integration-ingest`</span>.
        </p>
      </div>
    </section>
  );
}

export default function IntegrationsPage(props: Props) {
  return (
    <QueryProvider>
      <IntegrationsPageInner {...props} />
    </QueryProvider>
  );
}
