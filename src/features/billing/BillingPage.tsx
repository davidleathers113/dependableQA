import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function BillingPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Billing</h1>
          <p className="text-sm text-slate-400">
            Manage recharge settings, payment methods, and usage ledger.
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-white hover:bg-slate-700 transition-colors">
          Manage via Stripe
        </button>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {[
          { label: 'Current Balance', value: '$1,240.50', icon: '💰' },
          { label: 'Recharge Threshold', value: '$500.00', icon: '📉' },
          { label: 'Recharge Amount', value: '$1,000.00', icon: '🔄' },
        ].map((card) => (
          <div key={card.label} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.label}</p>
              <span>{card.icon}</span>
            </div>
            <p className="text-3xl font-bold text-white">{card.value}</p>
            <button className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors uppercase tracking-widest">
              Edit Setting
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Usage Ledger</h2>
          <button className="text-xs font-bold text-slate-400 hover:text-white transition-colors">Export CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Date</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Description</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Amount</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  No billing history found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
