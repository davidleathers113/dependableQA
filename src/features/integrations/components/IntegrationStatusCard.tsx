import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlugZap } from "lucide-react";
import type { IntegrationsSummary } from "../../../lib/app-data";
import { getIntegrationProviderLabel } from "../helpers";
import { IntegrationAuthForm } from "./IntegrationAuthForm";
import { IntegrationDiagnostics } from "./IntegrationDiagnostics";
import { IntegrationEndpointCard } from "./IntegrationEndpointCard";
import { IntegrationHealthSummary } from "./IntegrationHealthSummary";
import { IntegrationSetupGuide } from "./IntegrationSetupGuide";

interface Props {
  currentUserRole: string;
  integration: IntegrationsSummary["integrations"][number];
  organizationId: string;
}

export function IntegrationStatusCard({ currentUserRole, integration, organizationId }: Props) {
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

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update integration settings.");
      }
    },
    onSuccess: async () => {
      setErrorMessage("");
      setSuccessMessage("Webhook security settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to update integration settings.");
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
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition-colors hover:border-slate-700">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-100">
              <PlugZap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{integration.displayName}</h2>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {getIntegrationProviderLabel(integration.provider)}
              </p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-slate-400">
            Configure webhook delivery, confirm signing readiness, and inspect recent inbound events for this
            integration.
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        <IntegrationHealthSummary integration={integration} />

        <div className="grid gap-4 xl:grid-cols-2">
          <IntegrationEndpointCard integration={integration} />
          <IntegrationSetupGuide integration={integration} />
        </div>

        <IntegrationAuthForm
          canManage={canManage}
          integration={integration}
          isSaving={updateMutation.isPending}
          isTesting={testMutation.isPending}
          onSave={(input) => updateMutation.mutate(input)}
          onSendTestEvent={() => testMutation.mutate()}
        />

        <IntegrationDiagnostics integration={integration} />
      </div>
    </article>
  );
}
