import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { IntegrationsSummary } from "../../../lib/app-data";
import { getIntegrationProviderLabel } from "../helpers";
import { IntegrationDiagnosticsPanel } from "./IntegrationDiagnosticsPanel";
import { IntegrationHealthPanel } from "./IntegrationHealthPanel";
import { IntegrationProviderIcon } from "./IntegrationProviderIcon";
import { IntegrationSecurityPanel } from "./IntegrationSecurityPanel";
import { IntegrationSetupPanel } from "./IntegrationSetupPanel";
import { RingbaApiSyncPanel, type RingbaApiSyncFormInput } from "./RingbaApiSyncPanel";

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
}: Props) {
  const queryClient = useQueryClient();
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [highlightHealth, setHighlightHealth] = React.useState(false);
  const [highlightSetup, setHighlightSetup] = React.useState(false);
  const healthPanelRef = React.useRef<HTMLDivElement | null>(null);
  const setupPanelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!focusSection) {
      return;
    }

    if (focusSection === "health") {
      setHighlightHealth(true);
    } else {
      setHighlightSetup(true);
    }
    window.requestAnimationFrame(() => {
      if (focusSection === "health") {
        healthPanelRef.current?.focus();
      } else {
        setupPanelRef.current?.focus();
      }
    });
    const timeout = window.setTimeout(() => {
      setHighlightHealth(false);
      setHighlightSetup(false);
      onFocusHandled();
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [focusSection, onFocusHandled]);

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

  return (
    <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-1">
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
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {getIntegrationProviderLabel(integration.provider)}
              </p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-slate-400">
            {integration.provider === "ringba"
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

        {externalNotice?.type === "error" ? (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {externalNotice.text}
          </div>
        ) : null}
        {externalNotice?.type === "success" ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {externalNotice.text}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}
      </div>

      <div
        ref={healthPanelRef}
        tabIndex={-1}
        className={`rounded-[1.1rem] outline-none transition-all duration-300 ${
          highlightHealth
            ? "bg-violet-500/5 shadow-[0_0_0_1px_rgba(139,92,246,0.65),0_0_0_8px_rgba(139,92,246,0.08),0_0_48px_rgba(139,92,246,0.18)]"
            : ""
        }`}
      >
        <IntegrationHealthPanel integration={integration} />
      </div>
      <div
        ref={setupPanelRef}
        tabIndex={-1}
        className={`rounded-[1.1rem] outline-none transition-all duration-300 ${
          highlightSetup
            ? "bg-violet-500/5 shadow-[0_0_0_1px_rgba(139,92,246,0.65),0_0_0_8px_rgba(139,92,246,0.08),0_0_48px_rgba(139,92,246,0.18)]"
            : ""
        }`}
      >
        <IntegrationSetupPanel
          integration={integration}
          canManage={canManage}
          isTesting={testMutation.isPending}
          isCreating={isCreatingIntegration}
          onSendTestEvent={() => testMutation.mutate()}
          onLaunchWizard={onLaunchWizard}
        />
      </div>
      {integration.provider === "ringba" ? (
        <RingbaApiSyncPanel
          integration={integration}
          canManage={canManage}
          isSaving={ringbaApiMutation.isPending}
          isCreating={isCreatingIntegration}
          isSyncing={ringbaSyncMutation.isPending}
          onSave={(input) => ringbaApiMutation.mutate(input)}
          onSyncNow={() => ringbaSyncMutation.mutate()}
        />
      ) : null}
      {integration.provider !== "ringba" ? (
        <IntegrationSecurityPanel
          canManage={canManage}
          integration={integration}
          isSaving={updateMutation.isPending}
          isCreating={isCreatingIntegration}
          onCreateIntegration={onCreateIntegration}
          onSave={(input) => updateMutation.mutate(input)}
        />
      ) : null}
      <IntegrationDiagnosticsPanel integration={integration} />
    </section>
  );
}
