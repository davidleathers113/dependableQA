import type { CallListItem } from "../../../types/domain";

export const CALLS_TABLE_COLUMNS = [
  { key: "dateTime", label: "Date/Time" },
  { key: "callerNumber", label: "Caller Number" },
  { key: "campaign", label: "Campaign" },
  { key: "publisher", label: "Publisher" },
  { key: "duration", label: "Duration" },
  { key: "disposition", label: "Disposition" },
  { key: "review", label: "Review" },
  { key: "flags", label: "Flags" },
  { key: "topFlag", label: "Top Flag" },
  { key: "sourceProvider", label: "Source" },
  { key: "importBatch", label: "Import Batch" },
  { key: "reviewedBy", label: "Reviewed By" },
  { key: "lastUpdated", label: "Last Updated" },
] as const;

export type CallsTableColumnKey = (typeof CALLS_TABLE_COLUMNS)[number]["key"];

interface Props {
  rows: CallListItem[];
  onRowClick: (row: CallListItem) => void;
  visibleColumns: CallsTableColumnKey[];
  density: "comfortable" | "compact";
  isLoading: boolean;
  emptyMessage: string;
  sortBy: "startedAt" | "durationSeconds" | "flagCount" | "updatedAt";
  sortDirection: "asc" | "desc";
  onSortChange: (sortBy: "startedAt" | "durationSeconds" | "flagCount" | "updatedAt") => void;
}

const SORTABLE_COLUMNS: Partial<Record<CallsTableColumnKey, "startedAt" | "durationSeconds" | "flagCount" | "updatedAt">> = {
  dateTime: "startedAt",
  duration: "durationSeconds",
  flags: "flagCount",
  lastUpdated: "updatedAt",
};

export function CallsTable({
  rows,
  onRowClick,
  visibleColumns,
  density,
  isLoading,
  emptyMessage,
  sortBy,
  sortDirection,
  onSortChange,
}: Props) {
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

  const rowClassName = density === "compact" ? "px-4 py-3" : "px-6 py-4";
  const secondaryTextClassName = density === "compact" ? "text-xs text-slate-500" : "text-xs text-slate-500";
  const visibleSet = new Set(visibleColumns);

  const renderHeader = (columnKey: CallsTableColumnKey, label: string, alignRight = false) => {
    if (!visibleSet.has(columnKey)) {
      return null;
    }

    const sortableKey = SORTABLE_COLUMNS[columnKey];
    const isSorted = sortableKey === sortBy;

    return (
      <th
        key={columnKey}
        className={`${density === "compact" ? "px-4 py-3" : "px-6 py-4"} bg-slate-950/90 font-semibold uppercase tracking-[0.18em] text-[10px] ${alignRight ? "text-right" : ""}`}
      >
        {sortableKey ? (
          <button
            type="button"
            onClick={() => onSortChange(sortableKey)}
            className={`inline-flex items-center gap-1 transition-colors ${alignRight ? "ml-auto" : ""} ${isSorted ? "text-violet-300" : "hover:text-slate-200"}`}
          >
            <span>{label}</span>
            <span>{isSorted ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
          </button>
        ) : (
          label
        )}
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm border-collapse">
          <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
            <tr>
              {renderHeader("dateTime", "Date/Time")}
              {renderHeader("callerNumber", "Caller Number")}
              {renderHeader("campaign", "Campaign")}
              {renderHeader("publisher", "Publisher")}
              {renderHeader("duration", "Duration")}
              {renderHeader("disposition", "Disposition")}
              {renderHeader("review", "Review")}
              {renderHeader("flags", "Flags")}
              {renderHeader("topFlag", "Top Flag")}
              {renderHeader("sourceProvider", "Source")}
              {renderHeader("importBatch", "Import Batch")}
              {renderHeader("reviewedBy", "Reviewed By")}
              {renderHeader("lastUpdated", "Last Updated")}
              <th className={`${density === "compact" ? "px-4 py-3" : "px-6 py-4"} font-semibold uppercase tracking-wider text-[10px] text-right`}>Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={`loading-${index}`}>
                  <td colSpan={visibleColumns.length + 1} className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-3 w-32 animate-pulse rounded bg-slate-800" />
                      <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
                    </div>
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-6 py-12 text-center text-slate-500">
                  <div className="mx-auto flex max-w-md flex-col items-center space-y-3">
                    <div className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Queue Empty
                    </div>
                    <p className="text-base font-medium text-slate-300">{emptyMessage}</p>
                    <p className="text-sm text-slate-500">
                      Try widening the date range, clearing filters, or importing a new batch.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer hover:bg-slate-800/50 transition-colors"
                  onClick={() => onRowClick(row)}
                >
                  {visibleSet.has("dateTime") && (
                    <td className={`${rowClassName} whitespace-nowrap`}>
                      <div className="font-medium text-slate-200">{formatDate(row.startedAt)}</div>
                      <div className={secondaryTextClassName}>Started</div>
                    </td>
                  )}
                  {visibleSet.has("callerNumber") && (
                    <td className={`${rowClassName}`}>
                      <div className="font-mono text-slate-300">{row.callerNumber}</div>
                      <div className={secondaryTextClassName}>Caller</div>
                    </td>
                  )}
                  {visibleSet.has("campaign") && (
                    <td className={`${rowClassName} text-slate-400`}>
                      {row.campaignName ?? '—'}
                    </td>
                  )}
                  {visibleSet.has("publisher") && (
                    <td className={`${rowClassName} text-slate-400`}>
                      {row.publisherName ?? '—'}
                    </td>
                  )}
                  {visibleSet.has("duration") && (
                    <td className={`${rowClassName} text-slate-300 tabular-nums`}>
                      {formatDuration(row.durationSeconds)}
                    </td>
                  )}
                  {visibleSet.has("disposition") && (
                    <td className={rowClassName}>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        row.currentDisposition === 'Sale'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {row.currentDisposition ?? 'None'}
                      </span>
                    </td>
                  )}
                  {visibleSet.has("review") && (
                    <td className={rowClassName}>
                      <span className={`text-[10px] font-semibold uppercase tracking-tight ${
                        row.currentReviewStatus === 'reviewed' ? 'text-emerald-500' : 'text-slate-500'
                      }`}>
                        {row.currentReviewStatus}
                      </span>
                    </td>
                  )}
                  {visibleSet.has("flags") && (
                    <td className={rowClassName}>
                      {row.flagCount > 0 ? (
                        <span className="inline-flex items-center space-x-1 text-red-400">
                          <span className="text-xs">🚩</span>
                          <span className="font-bold tabular-nums">{row.flagCount}</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  )}
                  {visibleSet.has("topFlag") && (
                    <td className={`${rowClassName} max-w-[220px]`}>
                      <div className="truncate text-slate-400">{row.topFlag ?? '—'}</div>
                    </td>
                  )}
                  {visibleSet.has("sourceProvider") && (
                    <td className={`${rowClassName}`}>
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        {row.sourceProvider}
                      </span>
                    </td>
                  )}
                  {visibleSet.has("importBatch") && (
                    <td className={`${rowClassName} max-w-[220px]`}>
                      {row.importBatchId ? (
                        <a
                          href={`/app/imports/${row.importBatchId}`}
                          className="block truncate text-xs font-semibold text-violet-400 hover:text-violet-300"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.importBatchFilename ?? row.importBatchId.slice(0, 8)}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  )}
                  {visibleSet.has("reviewedBy") && (
                    <td className={`${rowClassName} text-slate-500`}>
                      {row.reviewedByName ?? '—'}
                    </td>
                  )}
                  {visibleSet.has("lastUpdated") && (
                    <td className={`${rowClassName} whitespace-nowrap text-slate-500`}>
                      {formatDate(row.lastUpdatedAt)}
                    </td>
                  )}
                  <td className={`${rowClassName} text-right`}>
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
