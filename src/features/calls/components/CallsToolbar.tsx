import * as React from 'react';

interface Props {
  organizationId: string;
}

export function CallsToolbar({ organizationId }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          placeholder="Search calls, transcripts, flags, campaigns..."
        />
        <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium hover:bg-slate-800 transition-colors">
          Date Range
        </button>
        <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium hover:bg-slate-800 transition-colors">
          Filters
        </button>
        <button className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium hover:bg-slate-800 transition-colors">
          Columns
        </button>
        <button className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20">
          Import Calls
        </button>
      </div>
    </div>
  );
}
