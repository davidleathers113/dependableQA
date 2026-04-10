import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { getReportsSummary, type ReportsSummary } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  initialData: ReportsSummary;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReportsPageInner({ organizationId, initialData }: Props) {
  const reportsQuery = useQuery({
    queryKey: ["reports", organizationId],
    queryFn: () => getReportsSummary(getBrowserSupabase(), organizationId),
    initialData,
  });

  const data = reportsQuery.data;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Reports</h1>
          <p className="text-sm text-slate-400">
            Decision support through live operational, compliance, and throughput metrics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled
            className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-500"
          >
            Saved Reports Soon
          </button>
          <button
            type="button"
            disabled
            className="h-10 rounded-xl bg-slate-800 px-4 text-sm font-bold text-slate-500"
          >
            Export PDF Soon
          </button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {data.cards.map((card) => (
          <div key={card.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{card.title}</p>
            <p className="text-3xl font-bold text-white">{card.value}</p>
            <p className="text-xs font-medium text-violet-400">{card.trend}</p>
            <p className="text-sm leading-6 text-slate-400">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4">
            <h2 className="text-sm font-semibold text-white">Publisher Risk Breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">
              Current-month publishers ranked by flagged-call volume.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Publisher</th>
                  <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Calls</th>
                  <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Flagged</th>
                  <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Flag Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.publisherBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No publisher-attributed calls exist for the current month yet.
                    </td>
                  </tr>
                ) : (
                  data.publisherBreakdown.map((publisher) => (
                    <tr key={publisher.publisherId ?? publisher.publisherName}>
                      <td className="px-6 py-4 text-slate-200">{publisher.publisherName}</td>
                      <td className="px-6 py-4 text-slate-400">{publisher.totalCalls}</td>
                      <td className="px-6 py-4 text-slate-400">{publisher.flaggedCalls}</td>
                      <td className="px-6 py-4 text-slate-300">{publisher.flagRate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold text-white">Review Velocity</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">This Month</p>
                <p className="mt-1 text-lg font-semibold text-white">{data.reviewVelocity.reviewsThisMonth}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Previous Month</p>
                <p className="mt-1 text-lg font-semibold text-white">{data.reviewVelocity.reviewsPreviousMonth}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Daily Average</p>
                <p className="mt-1 text-lg font-semibold text-white">{data.reviewVelocity.averagePerDay}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-800 px-6 py-4">
              <h2 className="text-sm font-semibold text-white">Recent Imports</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {data.recentImports.length === 0 ? (
                <div className="px-6 py-10 text-sm text-slate-500">No batches created this month yet.</div>
              ) : (
                data.recentImports.map((batch) => (
                  <div key={batch.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{batch.filename}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(batch.createdAt)} / {batch.rowCountRejected} rejected of {batch.rowCountTotal}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-300">
                        {batch.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export default function ReportsPage(props: Props) {
  return (
    <QueryProvider>
      <ReportsPageInner {...props} />
    </QueryProvider>
  );
}
