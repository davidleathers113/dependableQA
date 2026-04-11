import { describe, expect, it } from "vitest";
import type { ImportBatchSummary } from "../../lib/app-data";
import {
  canRetryImportBatch,
  deriveImportSummarySnapshot,
  filterImportBatches,
  findDuplicateImportBatch,
  formatImportDateTime,
  getImportRetryHelper,
  getImportProviderHelp,
  getImportProviderLabel,
  normalizeImportDispatchError,
  getImportStatusClassName,
  hasActiveImportBatches,
  isCsvFile,
  normalizeImportUploadError,
} from "./helpers";

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
      message: "The file uploaded, but batch processing could not be started. Open the batch list and try again.",
      batchId: "batch_1",
    });
  });

  it("formats import timestamps for the table", () => {
    expect(formatImportDateTime("2026-04-10T18:33:00.000Z").includes("Apr")).toBe(true);
  });

  it("normalizes retry dispatch errors", () => {
    expect(normalizeImportDispatchError("This batch is already processing.")).toBe(
      "This batch is already processing. Wait for it to finish before retrying."
    );
    expect(normalizeImportDispatchError("Retry dispatch is only available for uploaded, failed, or partial batches.")).toBe(
      "Retry dispatch is available only for uploaded, failed, or partial batches."
    );
  });
});
