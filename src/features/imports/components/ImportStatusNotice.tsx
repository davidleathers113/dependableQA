import type { ImportUploadErrorState, ImportUploadPhase } from "../helpers";
import { getImportUploadPhaseCopy } from "../helpers";

interface Props {
  phase: ImportUploadPhase;
  error?: ImportUploadErrorState | null;
  successMessage?: string;
}

export function ImportStatusNotice({ phase, error = null, successMessage = "" }: Props) {
  if (!error && !successMessage && phase === "idle") {
    return null;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
        <p className="text-sm font-semibold text-rose-100">{error.message}</p>
        {error.batchId ? (
          <a
            href={`/app/imports/${error.batchId}`}
            className="mt-2 inline-flex text-sm font-semibold text-rose-200 underline decoration-rose-300/40 underline-offset-4 hover:text-white"
          >
            Open batch
          </a>
        ) : null}
      </div>
    );
  }

  if (successMessage) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-100">{successMessage}</p>
      </div>
    );
  }

  const copy = getImportUploadPhaseCopy(phase);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
      <p className="text-sm font-semibold text-slate-100">{copy.primary}</p>
      <p className="mt-1 text-sm text-slate-400">{copy.secondary}</p>
    </div>
  );
}
