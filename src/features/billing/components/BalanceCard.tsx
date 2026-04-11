import { Wallet } from "lucide-react";
import { formatCurrency } from "../../../lib/app-data";

interface Props {
  currentBalanceCents: number;
  rechargeThresholdCents: number;
  isRefreshing: boolean;
  onAddFunds: () => void;
}

function getSecondaryCopy(currentBalanceCents: number, rechargeThresholdCents: number) {
  if (currentBalanceCents <= 0) {
    return "No available funds";
  }

  if (currentBalanceCents <= rechargeThresholdCents) {
    return "Below recommended operating buffer";
  }

  return "Available for call processing";
}

export function BalanceCard({ currentBalanceCents, rechargeThresholdCents, isRefreshing, onAddFunds }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className={`${isRefreshing ? "animate-pulse" : ""} space-y-5`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Available Balance</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-slate-300">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-semibold tracking-tight text-white">
            {formatCurrency(currentBalanceCents)}
          </p>
          <p className="text-sm text-slate-400">
            {getSecondaryCopy(currentBalanceCents, rechargeThresholdCents)}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddFunds}
          className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
        >
          Add funds
        </button>
      </div>
    </div>
  );
}
