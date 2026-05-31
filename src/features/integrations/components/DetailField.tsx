import * as React from "react";

interface DetailFieldProps {
  label: string;
  /** Primary value. Ignored when `children` is provided. */
  value?: string;
  /** Optional custom body (e.g. an icon + text). Overrides `value`. */
  children?: React.ReactNode;
}

/**
 * Compact labelled value tile used across the integration panels. Extracted
 * from IntegrationHealthPanel so the overview/capability UI can reuse it. The
 * label is `text-xs`/`slate-400` (was `text-[10px]`/`slate-500`) for legibility
 * and contrast.
 */
export function DetailField({ label, value, children }: DetailFieldProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {children ?? <p className="mt-2 text-sm text-slate-100">{value}</p>}
    </div>
  );
}
