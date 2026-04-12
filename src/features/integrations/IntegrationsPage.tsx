import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import type { IntegrationsSummary } from "../../lib/app-data";
import { CustomIntegrationInfoCard } from "./components/CustomIntegrationInfoCard";
import { IntegrationDetailWorkspace } from "./components/IntegrationDetailWorkspace";
import { RetreaverConnectWizard } from "./components/RetreaverConnectWizard";
import { RingbaConnectWizard } from "./components/RingbaConnectWizard";
import { IntegrationSummaryList } from "./components/IntegrationSummaryList";
import { TrackDriveConnectWizard } from "./components/TrackDriveConnectWizard";

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
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ["integrations", organizationId],
    queryFn: fetchIntegrationsSummary,
    initialData,
  });

  const integrations = integrationsQuery.data.integrations;
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const [selectedProvider, setSelectedProvider] = React.useState<string | null>(
    initialData.integrations[0]?.provider ?? null
  );
  const [activeWizardProvider, setActiveWizardProvider] = React.useState<string | null>(null);
  const [focusSection, setFocusSection] = React.useState<"health" | "setup" | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = React.useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const detailRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (integrations.length === 0) {
      setSelectedProvider(null);
      return;
    }

    const selectedStillExists = integrations.some((integration) => integration.provider === selectedProvider);
    if (!selectedStillExists) {
      setSelectedProvider(integrations[0]?.provider ?? null);
    }
  }, [integrations, selectedProvider]);

  const selectedIntegration =
    integrations.find((integration) => integration.provider === selectedProvider) ?? integrations[0] ?? null;
  const activeWizardIntegration =
    integrations.find((integration) => integration.provider === activeWizardProvider) ?? null;

  const createMutation = useMutation({
    mutationFn: async (input: { provider: string; displayName: string }) => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "create-integration",
          provider: input.provider,
          displayName: input.displayName,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create integration.");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      setWorkspaceNotice({ type: "success", text: payload.message ?? "Integration created." });
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setWorkspaceNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to create integration.",
      });
    },
  });

  const handleSelectIntegration = React.useCallback((provider: string) => {
    setWorkspaceNotice(null);
    setSelectedProvider(provider);
    setFocusSection(null);
    window.requestAnimationFrame(() => {
      detailRef.current?.focus();
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

  const handleLaunchWizard = React.useCallback(
    async (provider: string) => {
      if (provider === "custom") {
        return;
      }

      setWorkspaceNotice(null);
      setSelectedProvider(provider);

      const integration = integrations.find((entry) => entry.provider === provider);
      if (provider === "ringba" && integration && !integration.isConfigured) {
        if (!canManage) {
          setWorkspaceNotice({
            type: "error",
            text: "Only owners and admins can create the Ringba integration before guided setup.",
          });
          return;
        }

        try {
          await createMutation.mutateAsync({
            provider: integration.provider,
            displayName: integration.displayName,
          });
          const refreshed = await queryClient.fetchQuery({
            queryKey: ["integrations", organizationId],
            queryFn: fetchIntegrationsSummary,
          });
          const ringbaIntegration = refreshed.integrations.find((entry) => entry.provider === "ringba");
          if (!ringbaIntegration?.ringba.publicIngestKey) {
            setWorkspaceNotice({
              type: "error",
              text: "Ringba setup could not generate a public ingest key. Try again.",
            });
            return;
          }
        } catch {
          return;
        }
      }

      setActiveWizardProvider(provider);
    },
    [canManage, createMutation, integrations, organizationId, queryClient]
  );

  const handleWizardClose = React.useCallback(() => {
    setActiveWizardProvider(null);
  }, []);

  const handleWizardComplete = React.useCallback(
    async (provider: string) => {
      const integration = integrations.find((entry) => entry.provider === provider);
      if (integration && !integration.isConfigured && canManage && provider !== "ringba") {
        try {
          await createMutation.mutateAsync({
            provider: integration.provider,
            displayName: integration.displayName,
          });
        } catch {
          return;
        }
      }

      setSelectedProvider(provider);
      setActiveWizardProvider(null);
      setFocusSection(provider === "ringba" ? "health" : "setup");
      if (provider === "ringba") {
        setWorkspaceNotice({
          type: "success",
          text: "After a completed Ringba call arrives, diagnostics will update here.",
        });
      }
      window.requestAnimationFrame(() => {
        detailRef.current?.focus();
        detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    },
    [canManage, createMutation, integrations]
  );

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
                selectedIntegrationId={selectedIntegration?.provider ?? null}
                onSelect={handleSelectIntegration}
                onLaunchWizard={handleLaunchWizard}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedIntegration ? (
                <div ref={detailRef} tabIndex={-1} className="outline-none">
                  <IntegrationDetailWorkspace
                    integration={selectedIntegration}
                    organizationId={organizationId}
                    currentUserRole={currentUserRole}
                    focusSection={focusSection}
                    onFocusHandled={() => setFocusSection(null)}
                    isCreatingIntegration={createMutation.isPending}
                    onCreateIntegration={() =>
                      createMutation.mutate({
                        provider: selectedIntegration.provider,
                        displayName: selectedIntegration.displayName,
                      })
                    }
                    onLaunchWizard={() => handleLaunchWizard(selectedIntegration.provider)}
                    externalNotice={workspaceNotice}
                  />
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <CustomIntegrationInfoCard />

      {activeWizardIntegration?.provider === "trackdrive" ? (
        <TrackDriveConnectWizard
          integration={activeWizardIntegration}
          isOpen={true}
          onClose={handleWizardClose}
          onComplete={() => handleWizardComplete(activeWizardIntegration.provider)}
        />
      ) : null}
      {activeWizardIntegration?.provider === "ringba" ? (
        <RingbaConnectWizard
          integration={activeWizardIntegration}
          isOpen={true}
          onClose={handleWizardClose}
          onComplete={() => handleWizardComplete(activeWizardIntegration.provider)}
        />
      ) : null}
      {activeWizardIntegration?.provider === "retreaver" ? (
        <RetreaverConnectWizard
          integration={activeWizardIntegration}
          isOpen={true}
          onClose={handleWizardClose}
          onComplete={() => handleWizardComplete(activeWizardIntegration.provider)}
        />
      ) : null}
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
