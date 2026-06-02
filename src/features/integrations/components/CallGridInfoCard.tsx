import { PhoneCall } from "lucide-react";

/**
 * Honest placeholder for CallGrid. CallGrid is in the business requirement, but
 * only its real-time bidding (RTB) / bid API is publicly documented — we have not
 * verified a public API for importing historical call logs or syncing recordings,
 * so there is intentionally no native CallGrid client yet. This card makes that
 * explicit (it's not a missing-feature bug) and points the operator at the next
 * concrete step: share account docs/credentials, or use the custom signed webhook.
 */
export function CallGridInfoCard() {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-100">
          <PhoneCall className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">CallGrid</h2>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
              Needs account docs
            </span>
          </div>
          <p className="text-sm text-slate-300">
            CallGrid&apos;s real-time bidding (RTB) / bid API is publicly documented
            (<span className="font-mono text-xs text-slate-400">bid.callgrid.com/api/bid/&#123;Grid-ID&#125;</span>).
            That is a live-routing API — not the same as importing historical call logs or syncing recordings.
          </p>
          <p className="text-sm text-slate-400">
            We have not found a public CallGrid API for historical call-log/recording import, so a native CallGrid
            connector is not built yet — this is expected, not a bug. To enable it, share your CallGrid account&apos;s
            API documentation or credentials. In the meantime, you can forward CallGrid call events to DependableQA
            through the custom signed webhook path described above.
          </p>
        </div>
      </div>
    </section>
  );
}
