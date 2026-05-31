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
  // "custom" has no guided wizard (IntegrationsPage.handleLaunchWizard no-ops on
  // it), so don't surface a primary action that would do nothing.
  const supportsWizard = integration.provider !== "custom";

  return (
    <div
      className={`w-full rounded-2xl border transition-colors ${
        isSelected
          ? "border-violet-500/40 bg-slate-900 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]"
          : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
      }`}
    >
      {/* The whole card body is the single "open workspace" affordance. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className="block w-full rounded-t-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IntegrationProviderIcon provider={integration.provider} />
            <div>
              <h3 className="text-sm font-semibold text-white">{integration.displayName}</h3>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
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

      {supportsWizard ? (
        <div className="flex items-center justify-end border-t border-slate-800/70 px-4 py-3">
          <button
            type="button"
            onClick={onLaunchWizard}
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 transition-colors hover:border-violet-400/40 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {meta.primaryActionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
