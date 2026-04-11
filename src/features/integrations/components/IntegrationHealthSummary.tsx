import { Activity, BadgeInfo, ShieldCheck, ShieldOff } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  formatIntegrationDateTime,
  getIntegrationHealth,
  getSecretSourceLabel,
  getSecretStateDescription,
} from "../helpers";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

interface Props {
  integration: IntegrationCard;
}

function HealthFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value}</p>
    </div>
  );
}

export function IntegrationHealthSummary({ integration }: Props) {
  const health = getIntegrationHealth(integration);
  const authState = integration.webhookAuth.secretConfigured ? "Configured" : "Missing";

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Health summary</p>
          <h3 className="text-sm font-semibold text-white">{health.description}</h3>
          <p className="text-sm text-slate-400">
            Raw provider status: <span className="text-slate-200">{integration.status}</span>
          </p>
        </div>
        <IntegrationStatusBadge state={health.state} label={health.label} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HealthFact label="Mode" value={integration.mode} />
        <HealthFact label="Last success" value={formatIntegrationDateTime(integration.lastSuccessAt)} />
        <HealthFact label="Last error" value={formatIntegrationDateTime(integration.lastErrorAt)} />
        <HealthFact label="Webhook security" value={authState} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-sm font-semibold">Secret source</p>
          </div>
          <p className="mt-2 text-sm text-slate-100">{getSecretSourceLabel(integration.webhookAuth.secretSource)}</p>
          <p className="mt-1 text-xs text-slate-400">{getSecretStateDescription(integration)}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-300">
            {integration.webhookAuth.secretConfigured ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldOff className="h-4 w-4" />
            )}
            <p className="text-sm font-semibold">Readiness</p>
          </div>
          <p className="mt-2 text-sm text-slate-100">
            {integration.webhookAuth.secretConfigured
              ? "Inbound verification is active."
              : "Add a secret before relying on provider traffic."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {integration.lastSuccessAt
              ? "A successful inbound event has already been recorded."
              : "No successful webhook event has been recorded yet."}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Activity className="h-4 w-4" />
            <p className="text-sm font-semibold">Latest activity</p>
          </div>
          <p className="mt-2 text-sm text-slate-100">
            {integration.lastEventMessage ?? "No inbound activity has been recorded yet."}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <BadgeInfo className="h-3.5 w-3.5" />
            Severity: {integration.lastEventSeverity ?? "info"}
          </p>
        </div>
      </div>
    </section>
  );
}
