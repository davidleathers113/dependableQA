import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportBatchSummary } from "../../lib/app-data";
import type { ImportAiQueueResult } from "./api";
import {
  canRetryImportBatch,
  detectImportProvider,
  deriveImportSummarySnapshot,
  filterImportBatches,
  findDuplicateImportBatch,
  formatImportAiQueueNotice,
  formatImportDateTime,
  getImportProviderHint,
  getImportRetryHelper,
  getImportProviderHelp,
  getImportProviderLabel,
  getImportUploadPhaseCopy,
  normalizeImportDispatchError,
  getImportStatusClassName,
  hasActiveImportBatches,
  isCsvFile,
  normalizeImportUploadError,
  stashImportAiQueueNotice,
  takeImportAiQueueNotice,
} from "./helpers";

function aiQueue(overrides: Partial<ImportAiQueueResult> = {}): ImportAiQueueResult {
  return {
    attempted: true,
    blocked: true,
    reason: "insufficient_balance",
    transcriptionQueued: 0,
    analysisQueued: 0,
    skipped: 0,
    requiredCents: 500,
    availableCents: 100,
    ...overrides,
  };
}

function fakeSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe("import AI-queue notice", () => {
  it("formats an actionable notice when an opt-in is blocked by balance", () => {
    const message = formatImportAiQueueNotice(aiQueue());
    expect(message).toContain("AI was not queued");
    expect(message).toContain("Add funds");
    expect(message).toContain("Calls list");
  });

  it("uses a generic blocked notice for non-balance reasons", () => {
    const message = formatImportAiQueueNotice(aiQueue({ reason: "Too many calls selected." }));
    expect(message).toContain("AI was not queued");
    expect(message).not.toContain("Add funds");
  });

  it("returns null for metadata-only, successful, or missing outcomes", () => {
    expect(formatImportAiQueueNotice(aiQueue({ attempted: false, blocked: false }))).toBeNull();
    expect(formatImportAiQueueNotice(aiQueue({ attempted: true, blocked: false }))).toBeNull();
    expect(formatImportAiQueueNotice(null)).toBeNull();
    expect(formatImportAiQueueNotice(undefined)).toBeNull();
  });

  describe("stash/take handoff", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("stashes a blocked notice and yields it exactly once (clear on read)", () => {
      vi.stubGlobal("window", { sessionStorage: fakeSessionStorage() });
      stashImportAiQueueNotice("batch_1", aiQueue());
      expect(takeImportAiQueueNotice("batch_1")).toContain("Add funds");
      // One-shot: a second read (e.g. a later visit) sees nothing.
      expect(takeImportAiQueueNotice("batch_1")).toBeNull();
    });

    it("does not stash for metadata-only or successful imports", () => {
      vi.stubGlobal("window", { sessionStorage: fakeSessionStorage() });
      stashImportAiQueueNotice("batch_2", aiQueue({ attempted: false, blocked: false }));
      stashImportAiQueueNotice("batch_3", aiQueue({ attempted: true, blocked: false }));
      expect(takeImportAiQueueNotice("batch_2")).toBeNull();
      expect(takeImportAiQueueNotice("batch_3")).toBeNull();
    });

    it("is isolated per batch id (an unrelated batch sees nothing)", () => {
      vi.stubGlobal("window", { sessionStorage: fakeSessionStorage() });
      stashImportAiQueueNotice("batch_1", aiQueue());
      expect(takeImportAiQueueNotice("batch_other")).toBeNull();
    });
  });
});

const SAMPLE_BATCHES: ImportBatchSummary[] = [
  {
    id: "batch_1",
    filename: "trackdrive-apr-10.csv",
    status: "processing",
    rowCountTotal: 10,
    rowCountAccepted: 6,
    rowCountRejected: 1,
    createdAt: "2026-04-10T18:33:00.000Z",
    sourceProvider: "trackdrive",
    uploadedById: "user_1",
    uploadedByName: "Alex Operator",
  },
  {
    id: "batch_2",
    filename: "ringba-apr-09.csv",
    status: "failed",
    rowCountTotal: 8,
    rowCountAccepted: 0,
    rowCountRejected: 8,
    createdAt: "2026-04-09T18:33:00.000Z",
    sourceProvider: "ringba",
    uploadedById: "user_2",
    uploadedByName: "Taylor Analyst",
  },
];

describe("imports helpers", () => {
  it("returns human readable provider labels and guidance", () => {
    expect(getImportProviderLabel("trackdrive")).toBe("TrackDrive");
    expect(getImportProviderHelp("custom").includes("caller number")).toBe(true);
    expect(getImportProviderHelp("ringba").includes("publisher fields")).toBe(true);
    expect(getImportProviderHint("auto", "custom")).toEqual({
      label: "Auto-detect",
      text: "Auto-detect is on for Ringba, TrackDrive, and Retreaver exports.",
    });
    expect(getImportProviderHint("manual", "trackdrive")).toEqual({
      label: "TrackDrive format",
      text: "Use caller number, created time, and duration.",
    });
  });

  it("maps status values to semantic badge styles", () => {
    expect(getImportStatusClassName("completed").includes("emerald")).toBe(true);
    expect(getImportStatusClassName("failed").includes("rose")).toBe(true);
    expect(getImportStatusClassName("uploaded").includes("slate")).toBe(true);
  });

  it("filters recent batches by filename, provider, and status", () => {
    expect(
      filterImportBatches(SAMPLE_BATCHES, {
        search: "ringba",
        provider: "all",
        status: "all",
      })
    ).toEqual([SAMPLE_BATCHES[1]]);

    expect(
      filterImportBatches(SAMPLE_BATCHES, {
        search: "",
        provider: "trackdrive",
        status: "processing",
      })
    ).toEqual([SAMPLE_BATCHES[0]]);
  });

  it("detects active batches and validates csv files", () => {
    expect(hasActiveImportBatches(SAMPLE_BATCHES)).toBe(true);
    expect(isCsvFile({ name: "calls.csv", type: "" } as File)).toBe(true);
    expect(isCsvFile({ name: "calls.txt", type: "text/plain" } as File)).toBe(false);
  });

  it("auto-detects provider formats from filename and headers", () => {
    expect(
      detectImportProvider(
        "trackdrive-report.csv",
        "affiliate_sub_id,buyer_name,caller_number,started_at\nsub-1,Buyer,+1555,2026-04-10T10:00:00Z"
      )
    ).toMatchObject({
      provider: "trackdrive",
      suggestedProvider: "trackdrive",
    });

    expect(
      detectImportProvider(
        "normalized-export.csv",
        "caller_number,started_at,campaign_name,publisher_name\n+1555,2026-04-10T10:00:00Z,Campaign,Publisher"
      )
    ).toMatchObject({
      provider: "custom",
      suggestedProvider: "custom",
    });

    expect(
      detectImportProvider(
        "mystery.csv",
        "caller,created_at,duration\n+1555,2026-04-10T10:00:00Z,30"
      )
    ).toMatchObject({
      provider: null,
      confidence: "low",
    });
  });

  it("derives import summary cards from recent batches", () => {
    expect(
      deriveImportSummarySnapshot(
        [
          ...SAMPLE_BATCHES,
          {
            id: "batch_3",
            filename: "custom-apr-10.csv",
            status: "completed",
            rowCountTotal: 4,
            rowCountAccepted: 4,
            rowCountRejected: 0,
            createdAt: "2026-04-10T12:00:00.000Z",
            sourceProvider: "custom",
            uploadedById: "user_3",
            uploadedByName: "Jordan Ops",
          },
        ],
        new Date("2026-04-10T20:00:00.000Z").getTime()
      )
    ).toEqual({
      totalBatches: 3,
      processingBatches: 1,
      failedBatches: 1,
      completedToday: 1,
    });
  });

  it("finds duplicate import filenames using normalized names", () => {
    expect(findDuplicateImportBatch(SAMPLE_BATCHES, "trackdrive apr-10.csv")?.id).toBe("batch_1");
    expect(findDuplicateImportBatch(SAMPLE_BATCHES, "new-file.csv")).toBeNull();
  });

  it("marks retryable statuses and returns retry guidance", () => {
    expect(canRetryImportBatch("failed")).toBe(true);
    expect(canRetryImportBatch("completed")).toBe(false);
    expect(getImportRetryHelper("partial").includes("duplicates")).toBe(true);
  });

  it("normalizes duplicate and dispatch upload errors", () => {
    expect(
      normalizeImportUploadError({
        message: "The resource already exists",
      })
    ).toEqual({
      message: "A file with this name has already been uploaded. Rename the CSV and try again.",
      batchId: null,
    });

    expect(
      normalizeImportUploadError({
        message: "Unable to dispatch import batch.",
        stage: "dispatching",
        batchId: "batch_1",
      })
    ).toEqual({
      message: "The file uploaded, but batch processing could not be started. Open the recent batches list and retry if needed.",
      batchId: "batch_1",
    });

    expect(
      normalizeImportUploadError({
        message: "Unable to create import batch.",
        stage: "creating-batch",
      })
    ).toEqual({
      message: "The file uploaded, but we couldn't create an import batch.",
      batchId: null,
    });
  });

  it("formats import timestamps for the table", () => {
    expect(formatImportDateTime("2026-04-10T18:33:00.000Z").includes("Apr")).toBe(true);
  });

  it("returns shorter upload-phase helper copy", () => {
    expect(getImportUploadPhaseCopy("validating")).toEqual({
      primary: "Checking file...",
      secondary: "Validating the CSV and checking the format",
    });
    expect(getImportUploadPhaseCopy("idle")).toEqual({
      primary: "Drop a CSV file here, or browse",
      secondary: "CSV only · Auto-detect first",
    });
  });

  it("normalizes retry dispatch errors", () => {
    expect(normalizeImportDispatchError("This batch is already processing.")).toBe(
      "This batch is already processing. Wait for it to finish before retrying."
    );
    expect(normalizeImportDispatchError("Retry dispatch is only available for uploaded, failed, or partial batches.")).toBe(
      "Retry dispatch is available only for uploaded, failed, or partial batches."
    );
    expect(normalizeImportDispatchError("Unauthorized")).toBe("Your session expired. Refresh the page and try again.");
  });
});
