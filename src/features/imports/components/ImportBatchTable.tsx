import * as React from "react";
import type { ImportBatchSummary } from "../../../lib/app-data";
import {
  IMPORT_PROVIDER_OPTIONS,
  canRetryImportBatch,
  formatImportDateTime,
  formatImportRelativeTime,
  getImportProviderLabel,
} from "../helpers";
import { ImportEmptyState } from "./ImportEmptyState";
import { ImportStatusBadge } from "./ImportStatusBadge";

interface Props {
  batches: ImportBatchSummary[];
  filteredBatches: ImportBatchSummary[];
  isRefreshing: boolean;
  search: string;
  providerFilter: "all" | ImportBatchSummary["sourceProvider"];
  statusFilter: "all" | string;
  onSearchChange: (value: string) => void;
  onProviderFilterChange: (value: "all" | ImportBatchSummary["sourceProvider"]) => void;
  onStatusFilterChange: (value: "all" | string) => void;
  onRetryBatch?: (batch: ImportBatchSummary) => void;
  retryingBatchId?: string | null;
}

export function ImportBatchTable({
  batches,
  filteredBatches,
  isRefreshing,
  search,
  providerFilter,
  statusFilter,
  onSearchChange,
  onProviderFilterChange,
  onStatusFilterChange,
  onRetryBatch,
  retryingBatchId = null,
}: Props) {
  const availableStatuses = React.useMemo(() => {
    const statuses = Array.from(new Set(batches.map((batch) => batch.status.trim().toLowerCase()).filter((status) => status.length > 0)));
    statuses.sort();
    return statuses;
  }, [batches]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Recent Batches</h2>
            <p className="mt-1 text-sm text-slate-400">
              Scan recent imports, spot failures quickly, and follow batches into detail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{batches.length} batch{batches.length === 1 ? "" : "es"}</span>
            {isRefreshing ? <span className="text-violet-300">Refreshing active imports...</span> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,0.7fr))]">
          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Search Filename</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Search by CSV filename"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Provider</span>
            <select
              value={providerFilter}
              onChange={(event) => onProviderFilterChange(event.target.value as "all" | ImportBatchSummary["sourceProvider"])}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">All providers</option>
              {IMPORT_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">All statuses</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status[0]?.toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-semibold uppercase tracking-[0.18em] text-[10px]">Filename</th>
              <th className="px-6 py-3 font-semibold uppercase tracking-[0.18em] text-[10px]">Provider</th>
              <th className="w-[1%] px-6 py-3 font-semibold uppercase tracking-[0.18em] text-[10px]">Status</th>
              <th className="px-6 py-3 text-right font-semibold uppercase tracking-[0.18em] text-[10px]">Accepted</th>
              <th className="px-6 py-3 text-right font-semibold uppercase tracking-[0.18em] text-[10px]">Rejected</th>
              <th className="px-6 py-3 text-right font-semibold uppercase tracking-[0.18em] text-[10px]">Total</th>
              <th className="px-6 py-3 font-semibold uppercase tracking-[0.18em] text-[10px]">Created</th>
              <th className="px-6 py-3 font-semibold uppercase tracking-[0.18em] text-[10px]">Uploaded By</th>
              <th className="px-6 py-3 text-right font-semibold uppercase tracking-[0.18em] text-[10px]">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {batches.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <ImportEmptyState />
                </td>
              </tr>
            ) : filteredBatches.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <ImportEmptyState
                    title="No batches match the current filters"
                    body="Try a different filename search or widen the provider and status filters."
                    helper="The batch list is still available. Clear filters to see all recent imports."
                    ctaHref="#import-upload"
                    ctaLabel="Upload another CSV"
                  />
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch) => (
                <tr key={batch.id} className="transition-colors hover:bg-slate-800/50">
                  <td className="max-w-[280px] px-6 py-4">
                    <div className="truncate font-medium text-slate-200" title={batch.filename}>
                      {batch.filename}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{getImportProviderLabel(batch.sourceProvider)}</td>
                  <td className="px-6 py-4">
                    <ImportStatusBadge status={batch.status} />
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-300">{batch.rowCountAccepted}</td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-300">{batch.rowCountRejected}</td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-300">{batch.rowCountTotal}</td>
                  <td className="px-6 py-4 text-slate-400">
                    <div title={new Date(batch.createdAt).toLocaleString()}>{formatImportDateTime(batch.createdAt)}</div>
                    <div className="text-xs text-slate-500">{formatImportRelativeTime(batch.createdAt)}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{batch.uploadedByName ?? "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-3">
                      {onRetryBatch && canRetryImportBatch(batch.status) ? (
                        <button
                          type="button"
                          onClick={() => onRetryBatch(batch)}
                          disabled={retryingBatchId === batch.id}
                          className="text-xs font-semibold text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {retryingBatchId === batch.id ? "Retrying..." : "Retry"}
                        </button>
                      ) : null}
                      <a href={`/app/imports/${batch.id}`} className="text-xs font-semibold text-violet-400 hover:text-violet-300">
                        Open
                      </a>
                    </div>
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
