import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import type { IntegrationsSummary } from "../../lib/app-data";
import { CustomIntegrationInfoCard } from "./components/CustomIntegrationInfoCard";
import { IntegrationDetailWorkspace } from "./components/IntegrationDetailWorkspace";
import { IntegrationSummaryList } from "./components/IntegrationSummaryList";

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
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<string | null>(
    initialData.integrations[0]?.id ?? null
  );
  const detailRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (integrations.length === 0) {
      setSelectedIntegrationId(null);
      return;
    }

    const selectedStillExists = integrations.some((integration) => integration.id === selectedIntegrationId);
    if (!selectedStillExists) {
      setSelectedIntegrationId(integrations[0]?.id ?? null);
    }
  }, [integrations, selectedIntegrationId]);

  const selectedIntegration =
    integrations.find((integration) => integration.id === selectedIntegrationId) ?? integrations[0] ?? null;

  const handleSelectIntegration = React.useCallback((integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    window.requestAnimationFrame(() => {
      detailRef.current?.focus();
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

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
          <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <h2 className="text-lg font-semibold text-white">No integrations yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Add or configure a provider to start receiving inbound webhook events in DependableQA.
            </p>
          </div>
        ) : (
          <>
            <div className="lg:col-span-1">
              <IntegrationSummaryList
                integrations={integrations}
                selectedIntegrationId={selectedIntegration?.id ?? null}
                onSelect={handleSelectIntegration}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedIntegration ? (
                <div ref={detailRef} tabIndex={-1} className="outline-none">
                  <IntegrationDetailWorkspace
                    integration={selectedIntegration}
                    organizationId={organizationId}
                    currentUserRole={currentUserRole}
                  />
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <CustomIntegrationInfoCard />
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
