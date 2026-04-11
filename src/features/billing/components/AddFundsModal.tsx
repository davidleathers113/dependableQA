import { formatCurrency } from "../../../lib/app-data";

interface Props {
  isOpen: boolean;
  currentBalanceCents: number;
  fundHref: string;
  portalHref: string;
  onClose: () => void;
}

export function AddFundsModal({ isOpen, currentBalanceCents, fundHref, portalHref, onClose }: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Add funds</h2>
            <p className="mt-2 text-sm text-slate-400">
              Add funds with a hosted DependableQA checkout session that keeps the wallet recharge flow attributed to your
              billing account.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            Current wallet balance: <span className="font-semibold text-white">{formatCurrency(currentBalanceCents)}</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
            You can still use the shared Stripe billing portal if you need to manage other customer-level billing details.
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
            >
              Close
            </button>
            <a
              href={portalHref}
              className="inline-flex rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
            >
              Open Stripe billing portal
            </a>
            <a
              href={fundHref}
              className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            >
              Continue to checkout
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
