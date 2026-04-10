import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function UpdatesPage({ organizationId }: Props) {
  return (
    <section className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Product Updates</h1>
        <p className="text-sm text-slate-400">
          New features, improvements, and system announcements.
        </p>
      </header>

      <div className="space-y-12 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-slate-800">
        {[
          {
            version: 'v1.0.0',
            title: 'Platform Rebuild',
            date: 'April 10, 2026',
            content: 'Initial release of the new auditable call QA operations system. Featuring React islands, strict RLS, and immutable source snapshots.',
            tag: 'Major'
          },
          {
            version: 'v0.9.4',
            title: 'New AI Analysis Model',
            date: 'April 2, 2026',
            content: 'Upgraded call analysis to GPT-4o for better accuracy in compliance flag detection and sentiment analysis.',
            tag: 'Model'
          }
        ].map((update) => (
          <div key={update.version} className="relative pl-12">
            <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-slate-900 border-4 border-slate-950 ring-2 ring-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">
              {update.version[1]}
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-bold text-white">{update.title}</h3>
                <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-bold uppercase tracking-widest">
                  {update.tag}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500">{update.date} • {update.version}</p>
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <p className="text-sm text-slate-300 leading-relaxed">{update.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
