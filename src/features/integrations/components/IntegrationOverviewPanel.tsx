import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  formatIntegrationDateTime,
  getIntegrationCapabilities,
  getIntegrationChecklist,
  getIntegrationHealth,
  getIntegrationLatestEventText,
  getIntegrationNextStep,
  type IntegrationCapabilityState,
  type IntegrationWorkspaceTab,
} from "../helpers";
import { DetailField } from "./DetailField";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

const capabilityDot: Record<IntegrationCapabilityState, string> = {
  ready: "bg-emerald-400",
  inactive: "bg-slate-600",
  attention: "bg-amber-400",
};

interface Props {
  integration: IntegrationCard;
  onNavigate: (tab: IntegrationWorkspaceTab) => void;
}

export function IntegrationOverviewPanel({ integration, onNavigate }: Props) {
  const health = getIntegrationHealth(integration);
  const nextStep = getIntegrationNextStep(integration);
  const nextCta = nextStep.cta;
  const checklist = getIntegrationChecklist(integration);
  const capabilities = getIntegrationCapabilities(integration);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Status</h3>
            <p className="mt-1 max-w-xl text-sm text-slate-400">{health.description}</p>
          </div>
          <IntegrationStatusBadge state={health.state} label={health.label} />
        </div>

        <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-200">
            {nextStep.complete ? "All set" : "Next step"}
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{nextStep.label}</p>
              <p className="mt-1 text-sm text-slate-300">{nextStep.description}</p>
            </div>
            {nextCta ? (
              <button
                type="button"
                onClick={() => onNavigate(nextCta.targetTab)}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {nextCta.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-white">Capabilities</h3>
        <p className="mt-1 text-sm text-slate-400">Each ingestion path reports its own readiness.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((capability) => (
            <div key={capability.key} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${capabilityDot[capability.state]}`} aria-hidden />
                <p className="text-sm font-semibold text-slate-100">{capability.label}</p>
              </div>
              <p className="mt-2 text-xs text-slate-400">{capability.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-white">Setup checklist</h3>
        <ul className="mt-4 space-y-2">
          {checklist.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.targetTab)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-left transition-colors hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                )}
                <span className={`text-sm ${item.done ? "text-slate-400 line-through" : "text-slate-100"}`}>
                  {item.label}
                </span>
                {item.optional ? (
                  <span className="ml-auto rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Optional
                  </span>
                ) : null}
                <span className="sr-only">{item.done ? "completed" : "not completed"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Recent activity</h3>
          <button
            type="button"
            onClick={() => onNavigate("diagnostics")}
            className="rounded text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            View diagnostics
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-300">{getIntegrationLatestEventText(integration)}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DetailField label="Last success" value={formatIntegrationDateTime(integration.lastSuccessAt)} />
          <DetailField label="Last error" value={formatIntegrationDateTime(integration.lastErrorAt)} />
        </div>
      </section>
    </div>
  );
}
