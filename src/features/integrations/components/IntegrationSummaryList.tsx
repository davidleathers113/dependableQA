import type { IntegrationCard } from "../../../lib/app-data";
import { IntegrationSummaryCard } from "./IntegrationSummaryCard";

interface Props {
  integrations: IntegrationCard[];
  selectedIntegrationId: string | null;
  onSelect: (provider: string) => void;
  onLaunchWizard: (provider: string) => void;
}

export function IntegrationSummaryList({ integrations, selectedIntegrationId, onSelect, onLaunchWizard }: Props) {
  const connected = integrations.filter((integration) => integration.isConfigured);
  const available = integrations.filter((integration) => !integration.isConfigured);

  function renderCards(cards: IntegrationCard[]) {
    return (
      <div className="space-y-3">
        {cards.map((integration) => (
          <IntegrationSummaryCard
            key={integration.id}
            integration={integration}
            isSelected={integration.provider === selectedIntegrationId}
            onSelect={() => onSelect(integration.provider)}
            onLaunchWizard={() => onLaunchWizard(integration.provider)}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {connected.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Connected</h2>
          {renderCards(connected)}
        </div>
      ) : null}

      {available.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {connected.length > 0 ? "Available to add" : "Connect a call platform"}
            </h2>
            {connected.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400">
                Start with Ringba to import recordings and monitor ingestion health.
              </p>
            ) : null}
          </div>
          {renderCards(available)}
        </div>
      ) : null}
    </section>
  );
}
