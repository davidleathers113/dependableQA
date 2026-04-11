interface Props {
  title?: string;
  body?: string;
  helper?: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export function ImportEmptyState({
  title = "No imports yet",
  body = "Upload your first CSV to create an import batch and start processing call data.",
  helper = "Supported providers include TrackDrive, Ringba, Retreaver, and custom exports.",
  ctaHref = "#import-upload",
  ctaLabel = "Upload a CSV",
}: Props) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center space-y-3 px-6 py-12 text-center">
      <div className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Import Queue Empty
      </div>
      <p className="text-lg font-semibold text-slate-200">{title}</p>
      <p className="text-sm text-slate-400">{body}</p>
      <p className="text-sm text-slate-500">{helper}</p>
      <a
        href={ctaHref}
        className="inline-flex rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
      >
        {ctaLabel}
      </a>
    </div>
  );
}
