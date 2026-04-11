import { RefreshCcw } from "lucide-react";
import { formatCurrency } from "../../../lib/app-data";

interface Props {
  autopayEnabled: boolean;
  rechargeThresholdCents: number;
  rechargeAmountCents: number;
  isRefreshing: boolean;
  onEdit: () => void;
}

export function AutoRechargeCard({
  autopayEnabled,
  rechargeThresholdCents,
  rechargeAmountCents,
  isRefreshing,
  onEdit,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className={`${isRefreshing ? "animate-pulse" : ""} space-y-5`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Auto-Recharge Rule</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-slate-300">
            <RefreshCcw className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-2">
          <p className={`text-lg font-semibold leading-7 ${autopayEnabled ? "text-white" : "text-slate-400"}`}>
            Recharge {formatCurrency(rechargeAmountCents)} when balance falls below{" "}
            {formatCurrency(rechargeThresholdCents)}
          </p>
          <p className={`text-sm ${autopayEnabled ? "text-emerald-300" : "text-amber-300"}`}>
            {autopayEnabled ? "Auto-recharge enabled" : "Auto-recharge disabled"}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
        >
          Edit settings
        </button>
      </div>
    </div>
  );
}
