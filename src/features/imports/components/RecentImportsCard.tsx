import type { ReactNode } from "react";
import type { ImportBatchSummary } from "../../../lib/app-data";
import { deriveImportSummarySnapshot } from "../helpers";
import { ImportEmptyState } from "./ImportEmptyState";
import { RecentImportRow } from "./RecentImportRow";

interface Props {
  batches: ImportBatchSummary[];
  retryingBatchId?: string | null;
  onRetryBatch?: (batch: ImportBatchSummary) => void;
  notice?: ReactNode;
}

export function RecentImportsCard({ batches, retryingBatchId = null, onRetryBatch, notice = null }: Props) {
  const summary = deriveImportSummarySnapshot(batches);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Recent imports</h2>
          <p className="text-sm text-slate-400">
            Open a recent batch to inspect validation results and processing status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-800 px-3 py-1">{summary.totalBatches} recent</span>
          <span className="rounded-full border border-slate-800 px-3 py-1">{summary.processingBatches} processing</span>
          <span className="rounded-full border border-slate-800 px-3 py-1">{summary.failedBatches} failed</span>
          <span className="rounded-full border border-slate-800 px-3 py-1">{summary.completedToday} completed today</span>
        </div>
      </div>

      {notice ? <div className="mt-4">{notice}</div> : null}

      <div className="mt-5 space-y-3">
        {batches.length === 0 ? (
          <ImportEmptyState
            body="Upload your first CSV to create an import batch."
            helper=""
            ctaHref="#import-upload"
            ctaLabel="Start an import"
          />
        ) : (
          batches.map((batch) => (
            <RecentImportRow
              key={batch.id}
              batch={batch}
              onRetryBatch={onRetryBatch}
              isRetrying={retryingBatchId === batch.id}
            />
          ))
        )}
      </div>
    </section>
  );
}
