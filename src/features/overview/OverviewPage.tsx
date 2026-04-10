import * as React from 'react';

interface Props {
  organizationId: string;
  userId: string;
}

export default function OverviewPage({ organizationId }: Props) {
  return (
    <div className="space-y-6">
      {/* Status Strip */}
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
          { label: 'Account Balance', value: '$1,240.50', sub: 'Projected: 12 days left', color: 'text-white' },
          { label: 'Calls This Month', value: '4,821', sub: '+12% from last month', color: 'text-white' },
          { label: 'Minutes Processed', value: '18,402', sub: 'Avg 3.8m / call', color: 'text-white' },
          { label: 'Flag Rate', value: '4.2%', sub: '202 calls requiring review', color: 'text-violet-400' },
        ].map(kpi => (
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
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start space-x-3">
              <span className="text-red-500">⚠️</span>
              <div>
                <p className="text-sm font-medium text-red-200">Low Balance Alert</p>
                <p className="text-xs text-red-400/80">Your balance is below $500.00. Autopay is enabled.</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3">
              <span className="text-amber-500">🔌</span>
              <div>
                <p className="text-sm font-medium text-amber-200">Integration Degraded</p>
                <p className="text-xs text-amber-400/80">Ringba is returning errors for 12% of incoming webhooks.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {[
              { type: 'Import', msg: 'Batch #821 completed successfully', time: '2h ago' },
              { type: 'Review', msg: 'Call +1...8901 disposition overridden', time: '4h ago' },
              { type: 'Billing', msg: 'Auto-recharge of $500.00 processed', time: '1d ago' },
            ].map((activity, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                    {activity.type[0]}
                  </div>
                  <p className="text-sm text-slate-300">{activity.msg}</p>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
