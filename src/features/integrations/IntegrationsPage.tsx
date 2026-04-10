import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { getIntegrationsSummary, type IntegrationsSummary } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  initialData: IntegrationsSummary;
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

function IntegrationsPageInner({ organizationId, initialData }: Props) {
  const integrationsQuery = useQuery({
    queryKey: ["integrations", organizationId],
    queryFn: () => getIntegrationsSummary(getBrowserSupabase(), organizationId),
    initialData,
  });

  const integrations = integrationsQuery.data.integrations;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Integrations</h1>
        <p className="text-sm text-slate-400">
          Connect providers, verify health, and inspect ingest events.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {integrations.length === 0 ? (
          <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
            No integrations configured yet. Create records in Supabase or ingest your first webhook to populate this workspace.
          </div>
        ) : (
          integrations.map((integration) => (
          <div key={integration.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                  🔌
                </div>
                <h2 className="font-semibold text-white">{integration.displayName}</h2>
              </div>
              <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {integration.status}
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Status</span>
                <span className="text-slate-300">{integration.mode}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Last Event</span>
                <span className="text-slate-300">{integration.lastEventMessage ?? "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Last Success</span>
                <span className="text-slate-300">{formatDateTime(integration.lastSuccessAt)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
              Webhook endpoint: <span className="text-slate-300">`/.netlify/functions/integration-ingest`</span>
            </div>
          </div>
        )))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-400">Need a custom integration? Send signed provider payloads to <span className="text-violet-400">`/.netlify/functions/integration-ingest`</span>.</p>
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
