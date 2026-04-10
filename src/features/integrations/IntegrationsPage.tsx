import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function IntegrationsPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Integrations</h1>
        <p className="text-sm text-slate-400">
          Connect providers, verify health, and inspect ingest events.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {['TrackDrive', 'Ringba', 'Retreaver'].map((name) => (
          <div key={name} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                  🔌
                </div>
                <h2 className="font-semibold text-white">{name}</h2>
              </div>
              <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                disconnected
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Status</span>
                <span className="text-slate-300">Not Configured</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Last Event</span>
                <span className="text-slate-300">—</span>
              </div>
            </div>

            <button className="w-full mt-4 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 transition-colors">
              Configure
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-400">Need a custom integration? <a href="#" className="text-violet-400 hover:underline">View API Documentation</a></p>
      </div>
    </section>
  );
}
