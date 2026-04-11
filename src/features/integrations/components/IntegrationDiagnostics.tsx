import { AlertTriangle, CheckCircle2, Clock3, Siren } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  formatIntegrationDateTime,
  formatIntegrationRelativeTime,
  getDiagnosticsSummary,
  getIntegrationHealth,
} from "../helpers";

interface Props {
  integration: IntegrationCard;
}

function eventTone(severity: string) {
  if (severity === "error") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  }

  if (severity === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }

  return "border-slate-800 bg-slate-900 text-slate-100";
}

function DiagnosticsFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-100">{value}</p>
    </div>
  );
}

export function IntegrationDiagnostics({ integration }: Props) {
  const summary = getDiagnosticsSummary(integration);
  const health = getIntegrationHealth(integration);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-slate-300">
          <Siren className="h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">Diagnostics</h3>
        </div>
        <p className="text-sm text-slate-400">
          Recent webhook events help you confirm whether this integration is healthy, rejected, or still awaiting its
          first verified payload.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DiagnosticsFact
          label="Last received"
          value={summary.lastReceivedAt ? formatIntegrationDateTime(summary.lastReceivedAt) : "No events yet"}
        />
        <DiagnosticsFact label="Recent successes" value={String(summary.successCount)} />
        <DiagnosticsFact label="Recent warnings" value={String(summary.warningCount)} />
        <DiagnosticsFact label="Recent errors" value={String(summary.errorCount)} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
        {integration.lastEventMessage ?? health.description}
      </div>

      {integration.recentEvents.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4 text-sm text-slate-400">
          {integration.webhookAuth.secretConfigured
            ? "This integration is configured, but no inbound events have been recorded yet. Send a provider-side test event after setup."
            : "No inbound events are available yet because webhook security is still incomplete."}
        </div>
      ) : (
        <div className="space-y-3">
          {integration.recentEvents.map((event) => (
            <div key={event.id} className={`rounded-xl border px-4 py-3 ${eventTone(event.severity)}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {event.severity === "error" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : event.severity === "warning" ? (
                      <Clock3 className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <p className="text-sm font-semibold">{event.message}</p>
                  </div>
                  <p className="text-xs uppercase tracking-wider opacity-80">{event.eventType}</p>
                </div>
                <div className="text-right text-xs opacity-80">
                  <p>{formatIntegrationRelativeTime(event.createdAt) || formatIntegrationDateTime(event.createdAt)}</p>
                  <p>{formatIntegrationDateTime(event.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
