import { AlertTriangle, CheckCircle2, Clock3, Siren } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  formatIntegrationDateTime,
  formatIntegrationRelativeTime,
  getDiagnosticsSummary,
  getDiagnosticsSummaryLine,
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

  return "border-slate-800 bg-slate-950 text-slate-100";
}

export function IntegrationDiagnosticsPanel({ integration }: Props) {
  const summary = getDiagnosticsSummary(integration);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <div className="flex items-center gap-2 text-slate-300">
          <Siren className="h-4 w-4" />
          <h3 className="text-lg font-semibold text-white">Diagnostics</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">{getDiagnosticsSummaryLine(integration)}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Last event</p>
          <p className="mt-2 text-sm text-slate-100">
            {summary.lastReceivedAt ? formatIntegrationDateTime(summary.lastReceivedAt) : "No events yet"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recent successes</p>
          <p className="mt-2 text-sm text-slate-100">{summary.successCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recent warnings</p>
          <p className="mt-2 text-sm text-slate-100">{summary.warningCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recent errors</p>
          <p className="mt-2 text-sm text-slate-100">{summary.errorCount}</p>
        </div>
      </div>

      {integration.recentEvents.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
          <p className="text-sm font-semibold text-white">No recent events</p>
          <p className="mt-1 text-sm text-slate-400">
            {integration.isConfigured
              ? "Events will appear here after the provider sends webhooks to DependableQA."
              : "This provider has not been configured yet, so DependableQA has not received any webhook events."}
          </p>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider opacity-80">
                    <span>{event.severity}</span>
                    <span>{event.eventType}</span>
                  </div>
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
