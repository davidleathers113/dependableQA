import type { ImportBatchSummary } from "../../../lib/app-data";
import { canRetryImportBatch, formatRecentImportMeta } from "../helpers";
import { ImportStatusBadge } from "./ImportStatusBadge";

interface Props {
  batch: ImportBatchSummary;
  onRetryBatch?: (batch: ImportBatchSummary) => void;
  isRetrying?: boolean;
}

export function RecentImportRow({ batch, onRetryBatch, isRetrying = false }: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <p className="truncate font-medium text-slate-100" title={batch.filename}>
            {batch.filename}
          </p>
          <ImportStatusBadge status={batch.status} />
        </div>
        <p className="text-sm text-slate-400">{formatRecentImportMeta(batch)}</p>
        {batch.uploadedByName ? <p className="text-xs text-slate-500">Uploaded by {batch.uploadedByName}</p> : null}
      </div>

      <div className="flex items-center gap-4 self-start sm:self-center">
        {onRetryBatch && canRetryImportBatch(batch.status) ? (
          <button
            type="button"
            onClick={() => onRetryBatch(batch)}
            disabled={isRetrying}
            className="text-sm font-semibold text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
        ) : null}
        <a
          href={`/app/imports/${batch.id}`}
          className="text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          Open batch
        </a>
      </div>
    </div>
  );
}
