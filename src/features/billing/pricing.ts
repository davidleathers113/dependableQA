import { formatCurrency } from "../../lib/app-data";

/**
 * Client-safe mirror of the wallet-metering rules in `src/server/ai-pricing.ts`
 * (server-only — it must never be imported into a browser island). Kept tiny and
 * unit-tested so the billing explainer stays in sync with how charges actually
 * settle: per minute of analyzed audio, rounded up, with a 1-minute minimum.
 */

/** Example call length used in the billing explainer (3m 30s). */
export const PRICING_EXAMPLE_SECONDS = 210;

/** A call always bills at least one minute; partial minutes round up. */
export function billableMinutes(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

export function estimateCallCostCents(durationSeconds: number, perMinuteRateCents: number): number {
  return billableMinutes(durationSeconds) * Math.max(0, Math.floor(perMinuteRateCents));
}

/**
 * Sum the per-call billable estimate across a set of call durations. A call with
 * a missing/invalid duration still bills the one-minute minimum (via
 * `billableMinutes`), matching how the server settles charges.
 */
export function estimateBatchCostCents(
  durationsSeconds: readonly number[],
  perMinuteRateCents: number
): number {
  return durationsSeconds.reduce(
    (total, seconds) => total + estimateCallCostCents(seconds, perMinuteRateCents),
    0
  );
}

/**
 * "~$X.XX" estimate for analyzing a batch of calls at the org's per-minute rate,
 * or `null` when no rate is configured (analysis is not metered) so callers can
 * show a no-charge message instead of implying a $0 spend.
 */
export function estimateBatchCostLabel(
  durationsSeconds: readonly number[],
  perMinuteRateCents: number
): string | null {
  if (!(perMinuteRateCents > 0)) {
    return null;
  }
  return `~${formatCurrency(estimateBatchCostCents(durationsSeconds, perMinuteRateCents))}`;
}

export interface PricingDisplay {
  /** True when the org has a positive per-minute rate (i.e. analysis is metered). */
  configured: boolean;
  rateLabel: string;
  exampleSecondsLabel: string;
  exampleMinutes: number;
  exampleCostLabel: string;
}

function secondsLabel(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function describePricing(perMinuteRateCents: number): PricingDisplay {
  const safeRate = Math.max(0, Math.floor(perMinuteRateCents));
  return {
    configured: safeRate > 0,
    rateLabel: formatCurrency(safeRate),
    exampleSecondsLabel: secondsLabel(PRICING_EXAMPLE_SECONDS),
    exampleMinutes: billableMinutes(PRICING_EXAMPLE_SECONDS),
    exampleCostLabel: formatCurrency(estimateCallCostCents(PRICING_EXAMPLE_SECONDS, safeRate)),
  };
}
