export type AiProcessKind = "transcription" | "analysis";

function normalizeStatus(status: string) {
  return status.trim().toLowerCase();
}

export function getAiStatusLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "queued") return "Queued";
  if (normalized === "processing") return "Processing";
  if (normalized === "completed") return "Completed";
  if (normalized === "failed") return "Failed";
  return "Pending";
}

export function getAiStatusClassName(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (normalized === "processing") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  if (normalized === "queued") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  if (normalized === "failed") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return "border-slate-700 bg-slate-900/70 text-slate-300";
}

export function getAiEmptyState(kind: AiProcessKind, status: string, errorMessage: string | null) {
  const normalized = normalizeStatus(status);

  if (normalized === "queued") {
    return kind === "transcription"
      ? "Transcript processing is queued."
      : "Analysis is queued.";
  }

  if (normalized === "processing") {
    return kind === "transcription"
      ? "Transcript processing is in progress."
      : "Analysis is in progress.";
  }

  if (normalized === "failed") {
    return errorMessage || (kind === "transcription" ? "Transcript processing failed." : "Analysis failed.");
  }

  return kind === "transcription"
    ? "No transcript is available for this call."
    : "No AI analysis has been stored yet.";
}
