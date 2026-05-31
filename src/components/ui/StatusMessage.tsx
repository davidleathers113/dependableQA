import * as React from "react";

export type StatusMessageTone = "success" | "error" | "info";

interface StatusMessageProps {
  tone: StatusMessageTone;
  children: React.ReactNode;
  /** Extra classes appended to the container. */
  className?: string;
}

const toneClasses: Record<StatusMessageTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  info: "border-slate-800 bg-slate-950 text-slate-300",
};

/**
 * Single feedback surface for the integrations workspace. Errors are announced
 * assertively (role="alert"); success/info are announced politely
 * (role="status") so screen readers pick up async save/test results that the
 * sighted user sees inline. Replaces the previously scattered, visual-only
 * notice slots.
 */
export function StatusMessage({ tone, children, className }: StatusMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`rounded-xl border px-4 py-3 text-sm ${toneClasses[tone]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
