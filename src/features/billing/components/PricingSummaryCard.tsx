import { Calculator } from "lucide-react";
import { describePricing } from "../pricing";

interface Props {
  perMinuteRateCents: number;
}

/**
 * Plain-language explainer of the wallet/credit billing model, anchored to the
 * org's actual per-minute rate. Sits directly above the ledger so the user can
 * connect "how I'm charged" to the debits they see. Presentational only.
 */
export function PricingSummaryCard({ perMinuteRateCents }: Props) {
  const pricing = describePricing(perMinuteRateCents);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center gap-2 text-slate-300">
        <Calculator className="h-4 w-4" />
        <h2 className="text-lg font-semibold text-white">How you're billed</h2>
      </div>

      {pricing.configured ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight text-white">{pricing.rateLabel}</span>
          <span className="text-sm text-slate-400">per minute of analyzed audio</span>
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          No per-minute rate is configured yet, so AI analysis is not metered for this organization.
        </p>
      )}

      <ul className="space-y-1.5 text-sm text-slate-400">
        <li>Charges apply only when you run AI analysis — importing call metadata is free.</li>
        <li>
          Each analyzed call is billed per minute of audio, rounded up to the next whole minute (1-minute minimum).
        </li>
        <li>Only transcription is metered; re-running analysis on an existing transcript adds no charge.</li>
        <li>Analysis is gated by your wallet balance, and every charge appears in the ledger below.</li>
        {pricing.configured ? (
          <li>
            Example: a {pricing.exampleSecondsLabel} call ≈ {pricing.exampleMinutes} min × {pricing.rateLabel} ={" "}
            <span className="font-medium text-slate-200">{pricing.exampleCostLabel}</span>.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
