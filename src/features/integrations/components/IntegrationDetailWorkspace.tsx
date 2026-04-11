import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlugZap } from "lucide-react";
import type { IntegrationsSummary } from "../../../lib/app-data";
import { getIntegrationProviderLabel } from "../helpers";
import { IntegrationDiagnosticsPanel } from "./IntegrationDiagnosticsPanel";
import { IntegrationHealthPanel } from "./IntegrationHealthPanel";
import { IntegrationSecurityPanel } from "./IntegrationSecurityPanel";
import { IntegrationSetupPanel } from "./IntegrationSetupPanel";

interface Props {
  currentUserRole: string;
  integration: IntegrationsSummary["integrations"][number];
  organizationId: string;
}

export function IntegrationDetailWorkspace({ currentUserRole, integration, organizationId }: Props) {
  const queryClient = useQueryClient();
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");

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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-100">
              <PlugZap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{integration.displayName}</h2>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {getIntegrationProviderLabel(integration.provider)}
              </p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-slate-400">
            Configure webhook security, copy setup values, validate the integration, and troubleshoot recent inbound
            activity from one workspace.
          </p>
        </div>

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

      <IntegrationHealthPanel integration={integration} />
      <IntegrationSetupPanel
        integration={integration}
        canManage={canManage}
        isTesting={testMutation.isPending}
        onSendTestEvent={() => testMutation.mutate()}
      />
      <IntegrationSecurityPanel
        canManage={canManage}
        integration={integration}
        isSaving={updateMutation.isPending}
        onSave={(input) => updateMutation.mutate(input)}
      />
      <IntegrationDiagnosticsPanel integration={integration} />
    </section>
  );
}
