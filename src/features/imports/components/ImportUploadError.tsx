import type { ImportUploadErrorState } from "../helpers";

interface Props {
  error: ImportUploadErrorState;
}

export function ImportUploadError({ error }: Props) {
  return (
    <div className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-left">
      <p className="text-sm font-medium text-rose-100">{error.message}</p>
      {error.batchId ? (
        <a
          href={`/app/imports/${error.batchId}`}
          className="mt-2 inline-flex text-sm font-semibold text-rose-200 underline decoration-rose-300/40 underline-offset-4 hover:text-white"
        >
          Open batch detail
        </a>
      ) : null}
    </div>
  );
}
