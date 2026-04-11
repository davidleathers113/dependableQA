import type { ImportBatchSummary, IntegrationProvider } from "../../lib/app-data";

export type ImportUploadPhase = "uploading" | "creating" | "dispatching" | "redirecting";

export interface ImportUploadErrorState {
  message: string;
  batchId: string | null;
}

export interface ImportBatchFilters {
  search: string;
  provider: "all" | IntegrationProvider;
  status: "all" | string;
}

export interface ImportSummarySnapshot {
  totalBatches: number;
  processingBatches: number;
  failedBatches: number;
  completedToday: number;
}

export const IMPORT_PROVIDER_OPTIONS: Array<{ value: IntegrationProvider; label: string }> = [
  { value: "custom", label: "Custom" },
  { value: "trackdrive", label: "TrackDrive" },
  { value: "ringba", label: "Ringba" },
  { value: "retreaver", label: "Retreaver" },
];

export const IMPORT_UPLOAD_PHASE_LABELS: Record<ImportUploadPhase, string> = {
  uploading: "Uploading file...",
  creating: "Creating batch...",
  dispatching: "Dispatching import...",
  redirecting: "Opening batch detail...",
};

const IMPORT_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  custom: "Custom",
  trackdrive: "TrackDrive",
  ringba: "Ringba",
  retreaver: "Retreaver",
};

const TERMINAL_IMPORT_STATUSES = new Set(["completed", "partial", "failed"]);
const RETRYABLE_IMPORT_STATUSES = new Set(["uploaded", "failed", "partial"]);

export function getImportProviderLabel(provider: IntegrationProvider) {
  return IMPORT_PROVIDER_LABELS[provider];
}

export function getImportProviderHelp(provider: IntegrationProvider) {
  if (provider === "trackdrive") {
    return "Use a TrackDrive call export. Confirm it includes caller number, created time, duration, campaign, and transcript fields when available.";
  }

  if (provider === "ringba") {
    return "Use a Ringba call export with call identifiers, caller number, timestamps, duration, campaign, and publisher fields when available.";
  }

  if (provider === "retreaver") {
    return "Use a Retreaver export with caller number, call start time, duration, and source context.";
  }

  return "Use your normalized CSV template. At minimum, rows should include caller number and started time.";
}

export function getImportStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "uploaded") return "Uploaded";
  if (normalized === "processing") return "Processing";
  if (normalized === "completed") return "Completed";
  if (normalized === "partial") return "Partial";
  if (normalized === "failed") return "Failed";
  if (!normalized) return "Unknown";
  return normalized[0]?.toUpperCase() + normalized.slice(1);
}

export function getImportStatusClassName(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "processing") {
    return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  }

  if (normalized === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  if (normalized === "partial") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  if (normalized === "failed") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  }

  return "border-slate-700 bg-slate-800/80 text-slate-300";
}

export function getImportRetryHelper(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "partial") {
    return "Retry will re-process the uploaded CSV. Rows that already created calls may be rejected as duplicates.";
  }

  if (normalized === "failed") {
    return "Retry will re-process the uploaded CSV using the same batch detail page and current parser rules.";
  }

  if (normalized === "uploaded") {
    return "Dispatch has not completed yet for this batch. Retry will attempt to process the uploaded CSV.";
  }

  return "Retry dispatch is only available for uploaded, failed, or partial batches.";
}

export function formatImportDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatImportRelativeTime(value: string, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const deltaSeconds = Math.round((timestamp - now) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absoluteSeconds < 60) {
    return formatter.format(deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, "day");
}

export function hasActiveImportBatches(batches: ImportBatchSummary[]) {
  return batches.some((batch) => !TERMINAL_IMPORT_STATUSES.has(batch.status.trim().toLowerCase()));
}

export function canRetryImportBatch(status: string) {
  return RETRYABLE_IMPORT_STATUSES.has(status.trim().toLowerCase());
}

function normalizeImportFilename(fileName: string) {
  return fileName
    .trim()
    .toLowerCase()
    .split(" ").join("-")
    .split("/").join("-")
    .split("\\").join("-")
    .split(":").join("-")
    .split("?").join("-")
    .split("#").join("-");
}

export function findDuplicateImportBatch(
  batches: ImportBatchSummary[],
  fileName: string
) {
  const normalizedTarget = normalizeImportFilename(fileName);
  if (!normalizedTarget) {
    return null;
  }

  return (
    batches.find((batch) => normalizeImportFilename(batch.filename) === normalizedTarget) ?? null
  );
}

export function isCsvFile(file: Pick<File, "name" | "type">) {
  const fileName = file.name.trim().toLowerCase();
  const fileType = file.type.trim().toLowerCase();
  return fileName.endsWith(".csv") || fileType === "text/csv";
}

export function filterImportBatches(batches: ImportBatchSummary[], filters: ImportBatchFilters) {
  const search = filters.search.trim().toLowerCase();
  const status = filters.status.trim().toLowerCase();

  return batches.filter((batch) => {
    if (search && !batch.filename.toLowerCase().includes(search)) {
      return false;
    }

    if (filters.provider !== "all" && batch.sourceProvider !== filters.provider) {
      return false;
    }

    if (status !== "all" && batch.status.trim().toLowerCase() !== status) {
      return false;
    }

    return true;
  });
}

export function deriveImportSummarySnapshot(
  batches: ImportBatchSummary[],
  now = Date.now()
): ImportSummarySnapshot {
  const today = new Date(now);
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  let processingBatches = 0;
  let failedBatches = 0;
  let completedToday = 0;

  for (const batch of batches) {
    const normalizedStatus = batch.status.trim().toLowerCase();

    if (normalizedStatus === "processing") {
      processingBatches += 1;
    }

    if (normalizedStatus === "failed") {
      failedBatches += 1;
    }

    if (normalizedStatus === "completed") {
      const createdAt = new Date(batch.createdAt);
      if (
        createdAt.getFullYear() === year &&
        createdAt.getMonth() === month &&
        createdAt.getDate() === day
      ) {
        completedToday += 1;
      }
    }
  }

  return {
    totalBatches: batches.length,
    processingBatches,
    failedBatches,
    completedToday,
  };
}

export function normalizeImportDispatchError(message: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("unauthorized")) {
    return "Your session expired. Refresh and try again.";
  }

  if (normalized.includes("already processing")) {
    return "This batch is already processing. Wait for it to finish before retrying.";
  }

  if (normalized.includes("only available for uploaded, failed, or partial")) {
    return "Retry dispatch is available only for uploaded, failed, or partial batches.";
  }

  return "We couldn't re-run this import batch. Please try again.";
}

export function normalizeImportUploadError(input: {
  message: string;
  stage?: ImportUploadPhase | null;
  batchId?: string | null;
}): ImportUploadErrorState {
  const message = input.message.trim();
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already exists") ||
    normalized.includes("duplicate") ||
    normalized.includes("resource already exists")
  ) {
    return {
      message: "A file with this name has already been uploaded. Rename the CSV and try again.",
      batchId: null,
    };
  }

  if (normalized.includes("csv") && normalized.includes("upload")) {
    return {
      message: "Only CSV files can be uploaded here.",
      batchId: null,
    };
  }

  if (normalized.includes("unauthorized") || normalized.includes("session expired")) {
    return {
      message: "Your session expired. Refresh and try again.",
      batchId: null,
    };
  }

  if (input.stage === "dispatching" || input.batchId) {
    return {
      message: "The file uploaded, but batch processing could not be started. Open the batch list and try again.",
      batchId: input.batchId ?? null,
    };
  }

  return {
    message: "We couldn't upload this file. Please try again.",
    batchId: null,
  };
}
