import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function ReportsPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Reports</h1>
          <p className="text-sm text-slate-400">
            Decision support through operational trends and compliance analytics.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium hover:bg-slate-800 transition-colors">
            Saved Reports
          </button>
          <button className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20">
            Export PDF
          </button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[
          { title: 'Call Volume', value: '4,821', trend: '+12%', icon: '📊' },
          { title: 'Dispositions by Date', value: '82% Sale', trend: '+2%', icon: '📅' },
          { title: 'Flags by Publisher', value: '4.2%', trend: '-1%', icon: '🚩' },
          { title: 'Compliance Trend', value: '98.4%', trend: 'Stable', icon: '⚖️' },
          { title: 'Import Error Trend', value: '0.2%', trend: '-0.5%', icon: '🚫' },
          { title: 'Reviewer Throughput', value: '142/day', trend: '+14%', icon: '⏱️' },
        ].map((report) => (
          <div key={report.title} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 hover:border-slate-700 transition-colors group cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">{report.icon}</div>
              <span className={`text-xs font-bold ${report.trend.startsWith('+') ? 'text-emerald-400' : report.trend.startsWith('-') ? 'text-rose-400' : 'text-slate-500'}`}>
                {report.trend}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{report.title}</p>
              <p className="text-2xl font-bold text-white group-hover:text-violet-400 transition-colors">{report.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
