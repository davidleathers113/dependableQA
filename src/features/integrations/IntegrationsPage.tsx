import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Webhook } from "lucide-react";
import { QueryProvider } from "../../components/providers/QueryProvider";
import type { IntegrationsSummary } from "../../lib/app-data";
import { getWebhookEndpointUrl } from "./helpers";
import { IntegrationStatusCard } from "./components/IntegrationStatusCard";

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

function IntegrationsPageInner({ organizationId, currentUserRole, initialData }: Props) {
  const integrationsQuery = useQuery({
    queryKey: ["integrations", organizationId],
    queryFn: fetchIntegrationsSummary,
    initialData,
  });

  const integrations = integrationsQuery.data.integrations;
  const [copied, setCopied] = React.useState(false);
  const customEndpoint = React.useMemo(() => getWebhookEndpointUrl(), []);

  const handleCopyEndpoint = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(customEndpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [customEndpoint]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Integrations</h1>
        <p className="text-sm text-slate-400">
          Connect call providers, configure webhook security, and monitor inbound event health.
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
            No integrations yet. Add or configure a provider to start receiving inbound webhook events.
          </div>
        ) : (
          integrations.map((integration) => (
            <div key={integration.id} className="lg:col-span-3">
              <IntegrationStatusCard
                integration={integration}
                organizationId={organizationId}
                currentUserRole={currentUserRole}
              />
            </div>
        )))}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-300">
              <Webhook className="h-4 w-4" />
              <h2 className="text-sm font-semibold text-white">Custom webhook integrations</h2>
            </div>
            <p className="text-sm text-slate-400">
              Use the shared ingest endpoint for custom providers that can send signed JSON payloads to DependableQA.
            </p>
            <p className="break-all text-sm text-slate-100">{customEndpoint}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleCopyEndpoint();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied" : "Copy endpoint"}
          </button>
        </div>
      </section>
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
