import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { formatCurrency, getBillingSummary, type BillingSummary } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  initialData: BillingSummary;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BillingPageInner({ organizationId, initialData }: Props) {
  const billingQuery = useQuery({
    queryKey: ["billing", organizationId],
    queryFn: () => getBillingSummary(getBrowserSupabase(), organizationId),
    initialData,
  });

  const data = billingQuery.data;

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Billing</h1>
          <p className="text-sm text-slate-400">
            Manage recharge settings, payment methods, and usage ledger.
          </p>
        </div>
        <a href="/api/billing/portal" className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-white hover:bg-slate-700 transition-colors">
          Manage via Stripe
        </a>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {[
          { label: "Current Balance", value: formatCurrency(data.currentBalanceCents), icon: "💰" },
          { label: "Recharge Threshold", value: formatCurrency(data.rechargeThresholdCents), icon: "📉" },
          { label: "Recharge Amount", value: formatCurrency(data.rechargeAmountCents), icon: "🔄" },
        ].map((card) => (
          <div key={card.label} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.label}</p>
              <span>{card.icon}</span>
            </div>
            <p className="text-3xl font-bold text-white">{card.value}</p>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              {data.autopayEnabled ? "Autopay enabled" : "Autopay disabled"}
            </p>
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
              {data.ledger.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No billing history found.
                  </td>
                </tr>
              ) : (
                data.ledger.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-4 text-slate-300">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-6 py-4 text-slate-400">{entry.description ?? entry.entryType}</td>
                    <td className="px-6 py-4 text-slate-300">{formatCurrency(entry.amountCents)}</td>
                    <td className="px-6 py-4 text-slate-300">{formatCurrency(entry.balanceAfterCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function BillingPage(props: Props) {
  return (
    <QueryProvider>
      <BillingPageInner {...props} />
    </QueryProvider>
  );
}
