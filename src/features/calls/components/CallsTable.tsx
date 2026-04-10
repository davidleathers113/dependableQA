import * as React from "react";
import type { CallListItem } from "../../../types/domain";

interface Props {
  rows: CallListItem[];
  onRowClick: (row: CallListItem) => void;
}

export function CallsTable({ rows, onRowClick }: Props) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm border-collapse">
          <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Date/Time</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Caller Number</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Campaign</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Publisher</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Duration</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Disposition</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Review</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Flags</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px] text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-2xl">📁</span>
                    <p>No calls found yet. Import a batch or connect an integration.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer hover:bg-slate-800/40 transition-colors"
                  onClick={() => onRowClick(row)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300 font-medium">
                    {formatDate(row.startedAt)}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-300">
                    {row.callerNumber}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {row.campaignName ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {row.publisherName ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-slate-300 tabular-nums">
                    {formatDuration(row.durationSeconds)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      row.currentDisposition === 'Sale'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {row.currentDisposition ?? 'None'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-semibold uppercase tracking-tight ${
                      row.currentReviewStatus === 'reviewed' ? 'text-emerald-500' : 'text-slate-500'
                    }`}>
                      {row.currentReviewStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {row.flagCount > 0 ? (
                      <span className="inline-flex items-center space-x-1 text-red-400">
                        <span className="text-xs">🚩</span>
                        <span className="font-bold tabular-nums">{row.flagCount}</span>
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a
                      href={`/app/calls/${row.id}`}
                      className="text-xs font-semibold text-violet-400 hover:text-violet-300"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open Page
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
