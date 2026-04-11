import { Clock3 } from "lucide-react";
import type { BillingRunwaySummary } from "../../../lib/app-data";

interface Props {
  runway: BillingRunwaySummary;
  isRefreshing: boolean;
}

function formatShortDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function RunwayCard({ runway, isRefreshing }: Props) {
  const nextRechargeDate = formatShortDate(runway.estimatedNextRechargeAt);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className={`${isRefreshing ? "animate-pulse" : ""} space-y-5`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estimated Runway</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-slate-300">
            <Clock3 className="h-5 w-5" />
          </div>
        </div>
        {runway.projectedDaysRemaining === null ? (
          <div className="space-y-1">
            <p className="text-3xl font-semibold tracking-tight text-white">—</p>
            <p className="text-sm text-slate-400">
              Runway estimate will appear after more usage data is available.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-3xl font-semibold tracking-tight text-white">
              {runway.projectedDaysRemaining.toFixed(1)} days
            </p>
            <p className="text-sm text-slate-400">Based on recent average daily usage</p>
            {nextRechargeDate ? (
              <p className="text-sm text-slate-500">Projected next recharge: {nextRechargeDate}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
