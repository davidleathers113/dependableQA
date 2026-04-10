import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { formatCurrency, getOverviewData, type OverviewData } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  userId: string;
  initialData: OverviewData;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OverviewPageInner({ organizationId, initialData }: Props) {
  const overviewQuery = useQuery({
    queryKey: ["overview", organizationId],
    queryFn: () => getOverviewData(getBrowserSupabase(), organizationId),
    initialData,
  });

  const data = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-sm font-medium text-slate-300">System Operational</span>
        </div>
        <div className="text-sm text-slate-500">
          Organization ID: <span className="font-mono text-xs">{organizationId}</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: "Account Balance",
            value: formatCurrency(data.balanceCents),
            sub: data.projectedDaysRemaining ? `Projected: ${data.projectedDaysRemaining} days left` : "Projected: unavailable",
            color: "text-white",
          },
          {
            label: "Calls This Month",
            value: data.callsThisMonth.toLocaleString(),
            sub: `${data.minutesProcessed.toLocaleString()} minutes processed`,
            color: "text-white",
          },
          {
            label: "Minutes Processed",
            value: data.minutesProcessed.toLocaleString(),
            sub: `${data.openFlagCount.toLocaleString()} open flags`,
            color: "text-white",
          },
          {
            label: "Flag Rate",
            value: `${data.flagRate}%`,
            sub: `${data.openFlagCount.toLocaleString()} calls requiring review`,
            color: "text-violet-400",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
            <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-slate-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Actionable Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 className="text-lg font-semibold mb-4">Needs Attention</h3>
          {data.needsAttention.length === 0 ? (
            <p className="text-sm text-slate-500">No urgent issues detected for this organization.</p>
          ) : (
            <div className="space-y-3">
              {data.needsAttention.map((item) => {
                const toneClass =
                  item.tone === "critical"
                    ? "bg-red-500/10 border-red-500/20 text-red-200"
                    : item.tone === "warning"
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
                      : "bg-slate-800 border-slate-700 text-slate-200";

                return (
                  <div key={item.title} className={`p-3 rounded-xl border ${toneClass}`}>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs mt-1 opacity-80">{item.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity yet.</p>
            ) : (
              data.recentActivity.map((activity) => (
                <div key={`${activity.type}-${activity.createdAt}`} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                    {activity.type[0]?.toUpperCase()}
                  </div>
                  <p className="text-sm text-slate-300">{activity.message}</p>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{formatRelativeTime(activity.createdAt)}</span>
              </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage(props: Props) {
  return (
    <QueryProvider>
      <OverviewPageInner {...props} />
    </QueryProvider>
  );
}
