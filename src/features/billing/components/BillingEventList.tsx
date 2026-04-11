import type { BillingEventSummary } from "../../../lib/app-data";

interface Props {
  events: BillingEventSummary[];
  isRefreshing: boolean;
}

function toneClasses(tone: BillingEventSummary["tone"]) {
  if (tone === "success") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-100";
  }

  if (tone === "warning") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-100";
  }

  if (tone === "critical") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-100";
  }

  return "border-slate-800 bg-slate-900 text-slate-100";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BillingEventList({ events, isRefreshing }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Recent Billing Events</h2>
          <p className="text-sm text-slate-400">Key billing changes, recharge attempts, and funding updates.</p>
        </div>
        {isRefreshing ? <span className="text-xs text-slate-500">Refreshing…</span> : null}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        {events.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-6 text-sm text-slate-400">
            Recent recharge attempts, payment method changes, and billing updates will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className={`flex flex-col gap-2 rounded-xl border px-4 py-3 md:flex-row md:items-center md:justify-between ${toneClasses(event.tone)}`}
              >
                <p className="text-sm font-medium">{event.message}</p>
                <span className="text-xs opacity-80">{formatDateTime(event.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
