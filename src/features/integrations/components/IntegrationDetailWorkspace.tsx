import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, DownloadCloud, KeyRound, PlugZap, Siren, SlidersHorizontal, WandSparkles, Webhook } from "lucide-react";
import type { IntegrationsSummary } from "../../../lib/app-data";
import { Tabs, type TabDescriptor } from "../../../components/ui/Tabs";
import { StatusMessage } from "../../../components/ui/StatusMessage";
import { getIntegrationProviderLabel } from "../helpers";
import { useRingbaApiSyncForm, type RingbaApiSyncFormInput } from "../hooks/useRingbaApiSyncForm";
import { IntegrationDiagnosticsPanel } from "./IntegrationDiagnosticsPanel";
import { IntegrationOverviewPanel } from "./IntegrationOverviewPanel";
import { IntegrationProviderIcon } from "./IntegrationProviderIcon";
import { IntegrationSecurityPanel } from "./IntegrationSecurityPanel";
import { IntegrationSetupPanel } from "./IntegrationSetupPanel";
import { RingbaAdvancedSyncFields } from "./RingbaAdvancedSyncFields";
import { RingbaConnectionFields } from "./RingbaConnectionFields";
import { RingbaImportPanel } from "./RingbaImportPanel";

interface Props {
  currentUserRole: string;
  integration: IntegrationsSummary["integrations"][number];
  organizationId: string;
  focusSection: "health" | "setup" | null;
  onFocusHandled: () => void;
  isCreatingIntegration: boolean;
  onCreateIntegration: () => void;
  onLaunchWizard: () => void;
  externalNotice: { type: "success" | "error"; text: string } | null;
  /** Org per-minute wallet rate (cents); 0 when analysis is not metered. */
  perMinuteRateCents: number;
}

export function IntegrationDetailWorkspace({
  currentUserRole,
  integration,
  organizationId,
  focusSection,
  onFocusHandled,
  isCreatingIntegration,
  onCreateIntegration,
  onLaunchWizard,
  externalNotice,
  perMinuteRateCents,
}: Props) {
  const queryClient = useQueryClient();
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const isRingba = integration.provider === "ringba";
  // Single feedback slot for in-workspace actions (save / sync / test event /
  // create). The setter pair keeps existing call sites unchanged while routing
  // everything through one aria-live region.
  const [feedback, setFeedback] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const setSuccessMessage = (text: string) => setFeedback(text ? { tone: "success", text } : null);
  const setErrorMessage = (text: string) => setFeedback(text ? { tone: "error", text } : null);
  // Dedicated, panel-local feedback for "Test connection" so the result shows
  // next to the button at the bottom of the panel — not only in the page-top
  // message box (which is off-screen when you click Test).
  const [ringbaTestNotice, setRingbaTestNotice] = React.useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [activeTab, setActiveTab] = React.useState<string>("overview");

  // Reset to Overview whenever a different integration is selected so the user
  // never lands on a tab that doesn't exist for the new provider.
  React.useEffect(() => {
    setActiveTab("overview");
  }, [integration.id]);

  // Wizard completion / deep-link requests focus a section; map those to tabs.
  React.useEffect(() => {
    if (!focusSection) {
      return;
    }
    if (focusSection === "health") {
      setActiveTab("overview");
    } else {
      setActiveTab(isRingba ? "pixel" : "setup");
    }
    onFocusHandled();
  }, [focusSection, isRingba, onFocusHandled]);

  const updateMutation = useMutation({
    mutationFn: async (input: {
      authType: typeof integration.webhookAuth.authType;
      headerName: string;
      prefix: string;
      secret: string;
    }) => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "update-webhook-auth",
          integrationId: integration.id,
          ...input,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "We couldn’t save these settings. Check the values and try again.");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      setErrorMessage("");
      setSuccessMessage(payload.message ?? "Security settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "We couldn’t save these settings. Check the values and try again.");
    },
  });

  const ringbaApiMutation = useMutation({
    mutationFn: async (input: RingbaApiSyncFormInput) => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "update-ringba-api",
          integrationId: integration.id,
          ringbaApiSyncEnabled: input.ringbaApiSyncEnabled,
          ringbaAccountId: input.ringbaAccountId,
          apiAccessToken: input.apiAccessToken,
          callLogsTimeZone: input.callLogsTimeZone,
          pollIntervalMinutes: input.pollIntervalMinutes,
          lookbackHours: input.lookbackHours,
          minimumDurationSeconds: input.minimumDurationSeconds,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "We couldn’t save Ringba API settings.");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      setErrorMessage("");
      setSuccessMessage(payload.message ?? "Ringba API settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "We couldn’t save Ringba API settings.");
    },
  });

  const ringbaSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "sync-ringba-api",
          integrationId: integration.id,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Ringba API sync failed.");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      setErrorMessage("");
      setSuccessMessage(payload.message ?? "Ringba API sync completed.");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Ringba API sync failed.");
    },
  });

  const ringbaTestMutation = useMutation({
    mutationFn: async (input: { ringbaAccountId: string; apiAccessToken: string; callLogsTimeZone: string }) => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "test-ringba-connection",
          integrationId: integration.id,
          // Test what's currently typed in the form so users can validate before
          // saving; a blank token falls back to the saved one server-side.
          ringbaAccountId: input.ringbaAccountId,
          apiAccessToken: input.apiAccessToken,
          callLogsTimeZone: input.callLogsTimeZone,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Ringba connection test failed.");
      }

      return payload;
    },
    onMutate: () => {
      setRingbaTestNotice(null);
    },
    onSuccess: (payload) => {
      setRingbaTestNotice({ type: "success", text: payload.message ?? "Ringba connection test succeeded." });
    },
    onError: (error) => {
      setRingbaTestNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Ringba connection test failed.",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "send-test-event",
          integrationId: integration.id,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to send a test event.");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      setErrorMessage("");
      setSuccessMessage(payload.message ?? "Test event accepted.");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to send a test event.");
    },
  });

  // One form shared by the API connection tab and the Advanced tab. Called
  // unconditionally (Rules of Hooks); harmless for non-Ringba providers.
  const ringbaForm = useRingbaApiSyncForm({ integration, testNotice: ringbaTestNotice });

  const setupPanel = (
    <IntegrationSetupPanel
      integration={integration}
      canManage={canManage}
      isTesting={testMutation.isPending}
      isCreating={isCreatingIntegration}
      onSendTestEvent={() => testMutation.mutate()}
      onLaunchWizard={onLaunchWizard}
    />
  );
  const diagnosticsPanel = <IntegrationDiagnosticsPanel integration={integration} onNavigate={setActiveTab} />;
  const overviewPanel = <IntegrationOverviewPanel integration={integration} onNavigate={setActiveTab} />;

  const tabs: TabDescriptor[] = isRingba
    ? [
        { id: "overview", label: "Overview", icon: Activity, panel: overviewPanel },
        {
          id: "api",
          label: "API",
          icon: PlugZap,
          panel: (
            <RingbaConnectionFields
              form={ringbaForm}
              canManage={canManage}
              isConfigured={integration.isConfigured}
              isCreating={isCreatingIntegration}
              isSaving={ringbaApiMutation.isPending}
              isTesting={ringbaTestMutation.isPending}
              lastRingbaApiSyncAt={integration.ringba.lastRingbaApiSyncAt}
              testNotice={ringbaTestNotice}
              onCreate={onCreateIntegration}
              onSave={(input) => ringbaApiMutation.mutate(input)}
              onTestConnection={(input) => ringbaTestMutation.mutate(input)}
            />
          ),
        },
        { id: "pixel", label: "Pixel", icon: Webhook, panel: setupPanel },
        { id: "imports", label: "Imports", icon: DownloadCloud, panel: <RingbaImportPanel integration={integration} canManage={canManage} perMinuteRateCents={perMinuteRateCents} /> },
        { id: "diagnostics", label: "Diagnostics", icon: Siren, panel: diagnosticsPanel },
        {
          id: "advanced",
          label: "Advanced",
          icon: SlidersHorizontal,
          panel: (
            <RingbaAdvancedSyncFields
              form={ringbaForm}
              canManage={canManage}
              isConfigured={integration.isConfigured}
              isCreating={isCreatingIntegration}
              isSaving={ringbaApiMutation.isPending}
              isSyncing={ringbaSyncMutation.isPending}
              onSave={(input) => ringbaApiMutation.mutate(input)}
              onSyncNow={() => ringbaSyncMutation.mutate()}
            />
          ),
        },
      ]
    : [
        { id: "overview", label: "Overview", icon: Activity, panel: overviewPanel },
        { id: "setup", label: "Setup", icon: WandSparkles, panel: setupPanel },
        {
          id: "security",
          label: "Security",
          icon: KeyRound,
          panel: (
            <IntegrationSecurityPanel
              canManage={canManage}
              integration={integration}
              isSaving={updateMutation.isPending}
              isCreating={isCreatingIntegration}
              onCreateIntegration={onCreateIntegration}
              onSave={(input) => updateMutation.mutate(input)}
            />
          ),
        },
        { id: "diagnostics", label: "Diagnostics", icon: Siren, panel: diagnosticsPanel },
      ];

  // Guard against a stale tab id after switching providers (before the reset
  // effect runs) so a panel is always visible.
  const resolvedTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <IntegrationProviderIcon
              provider={integration.provider}
              sizeClassName="h-5 w-5"
              containerClassName="flex h-11 w-11 items-center justify-center rounded-xl"
            />
            <div>
              <h2 className="text-xl font-semibold text-white">{integration.displayName}</h2>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {getIntegrationProviderLabel(integration.provider)}
              </p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-slate-400">
            {isRingba
              ? "Copy the Ringba pixel URL, validate inbound event health, and troubleshoot recent activity from one workspace."
              : "Configure webhook security, copy setup values, validate the integration, and troubleshoot recent inbound activity from one workspace."}
          </p>
        </div>
        {!integration.isConfigured ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            This provider has not been configured yet. Create the integration to save security settings and start
            receiving provider events.
          </div>
        ) : null}

        {externalNotice ? (
          <StatusMessage tone={externalNotice.type} className="mt-4">
            {externalNotice.text}
          </StatusMessage>
        ) : null}
        {feedback ? (
          <StatusMessage tone={feedback.tone} className="mt-4">
            {feedback.text}
          </StatusMessage>
        ) : null}
      </div>

      <Tabs
        tabs={tabs}
        value={resolvedTab}
        onValueChange={setActiveTab}
        idBase={`integration-${integration.id}`}
        ariaLabel={`${integration.displayName} workspace`}
      />
    </section>
  );
}
