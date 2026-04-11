import { BookOpenText } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getIntegrationProviderLabel, getIntegrationSetupSteps } from "../helpers";

interface Props {
  integration: IntegrationCard;
}

export function IntegrationSetupGuide({ integration }: Props) {
  const steps = getIntegrationSetupSteps(integration);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-slate-300">
          <BookOpenText className="h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">Provider setup guide</h3>
        </div>
        <p className="text-sm text-slate-400">
          Use these operator-facing steps when configuring {getIntegrationProviderLabel(integration.provider)} to send
          inbound events to DependableQA.
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-200">
              {index + 1}
            </div>
            <p className="text-sm text-slate-200">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
