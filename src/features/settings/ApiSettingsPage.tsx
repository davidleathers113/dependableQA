import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function ApiSettingsPage({ organizationId }: Props) {
  return (
    <section className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">API Keys</h1>
          <p className="text-sm text-slate-400">Manage API keys for programmatic access to your call data and ingestion.</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 transition-colors">
          Generate New Key
        </button>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Label</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Key Prefix</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Last Used</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Created</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No active API keys found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
          <span>📖</span>
          <span>Integration Guide</span>
        </h3>
        <p className="text-sm text-slate-400">Use these keys to authenticate your requests to our ingestion and query endpoints. Always keep your secret keys secure.</p>
        <a href="#" className="text-xs font-bold text-violet-400 hover:text-violet-300 uppercase tracking-widest transition-colors inline-block">View API Docs →</a>
      </div>
    </section>
  );
}
