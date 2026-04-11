import { ChevronRight } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getIntegrationProviderLabel, getIntegrationSummaryMeta, getIntegrationHealth } from "../helpers";
import { IntegrationProviderIcon } from "./IntegrationProviderIcon";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

interface Props {
  integration: IntegrationCard;
  isSelected: boolean;
  onSelect: () => void;
  onLaunchWizard: () => void;
}

export function IntegrationSummaryCard({ integration, isSelected, onSelect, onLaunchWizard }: Props) {
  const health = getIntegrationHealth(integration);
  const meta = getIntegrationSummaryMeta(integration);

  return (
    <div
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        isSelected
          ? "border-violet-500/40 bg-slate-900 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]"
          : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
      }`}
    >
      <div className="space-y-4">
        <button type="button" onClick={onSelect} className="block w-full text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <IntegrationProviderIcon provider={integration.provider} />
              <div>
                <h3 className="text-sm font-semibold text-white">{integration.displayName}</h3>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {getIntegrationProviderLabel(integration.provider)}
                </p>
              </div>
            </div>
            <IntegrationStatusBadge state={health.state} label={health.label} />
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-300">{meta.setupModelDescription}</p>
            <p className="text-xs text-slate-500">{meta.latestStatusLabel}</p>
          </div>
        </button>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex items-center gap-2 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
          >
            Open workspace
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onLaunchWizard}
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 transition-colors hover:border-violet-400/40 hover:bg-violet-500/20"
          >
            {meta.primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
