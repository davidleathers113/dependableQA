import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function ImportsPage({ organizationId }: Props) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Imports</h1>
        <p className="text-sm text-slate-400">
          Upload CSVs, inspect validation results, and track batch processing.
        </p>
      </header>

      <div className="rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/50 p-12 text-center hover:border-violet-500/50 transition-colors group cursor-pointer">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            📤
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">Drop CSV here or browse</p>
            <p className="mt-1 text-xs text-slate-500">TrackDrive, Ringba, Retreaver, or custom CSV</p>
          </div>
          <button className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20">
            Select File
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-sm font-semibold text-white">Recent Batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Filename</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Accepted</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Rejected</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No import batches found for this organization.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
