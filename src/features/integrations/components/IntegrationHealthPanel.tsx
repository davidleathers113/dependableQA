import { Activity } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import { formatIntegrationDateTime, getIntegrationHealth, getIntegrationLatestEventText } from "../helpers";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

interface Props {
  integration: IntegrationCard;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-100">{value}</p>
    </div>
  );
}

export function IntegrationHealthPanel({ integration }: Props) {
  const health = getIntegrationHealth(integration);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Health</h3>
          <p className="mt-1 text-sm text-slate-400">
            Review current readiness before changing setup or webhook security.
          </p>
        </div>
        <IntegrationStatusBadge state={health.state} label={health.label} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Status" value={health.label} />
        <DetailField label="Mode" value={integration.mode} />
        <DetailField label="Webhook auth" value={integration.webhookAuth.secretConfigured ? "Configured" : "Missing"} />
        <DetailField label="Last success" value={formatIntegrationDateTime(integration.lastSuccessAt)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DetailField label="Last error" value={formatIntegrationDateTime(integration.lastErrorAt)} />
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Activity className="h-4 w-4" />
            <p className="text-sm font-semibold">Latest event</p>
          </div>
          <p className="mt-2 text-sm text-slate-100">{getIntegrationLatestEventText(integration)}</p>
        </div>
      </div>
    </section>
  );
}
