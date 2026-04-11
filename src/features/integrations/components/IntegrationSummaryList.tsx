import type { IntegrationCard } from "../../../lib/app-data";
import { IntegrationSummaryCard } from "./IntegrationSummaryCard";

interface Props {
  integrations: IntegrationCard[];
  selectedIntegrationId: string | null;
  onSelect: (provider: string) => void;
  onLaunchWizard: (provider: string) => void;
}

export function IntegrationSummaryList({ integrations, selectedIntegrationId, onSelect, onLaunchWizard }: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Supported integrations</h2>
        <p className="mt-1 text-sm text-slate-400">
          Scan supported providers, review health at a glance, then open the selected workspace for setup and
          operations.
        </p>
      </div>

      <div className="space-y-3">
        {integrations.map((integration) => (
          <IntegrationSummaryCard
            key={integration.id}
            integration={integration}
            isSelected={integration.provider === selectedIntegrationId}
            onSelect={() => onSelect(integration.provider)}
            onLaunchWizard={() => onLaunchWizard(integration.provider)}
          />
        ))}
      </div>
    </section>
  );
}
