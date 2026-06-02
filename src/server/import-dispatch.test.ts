import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertAuditLog } = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
}));
const { enqueueAiJob } = vi.hoisted(() => ({
  enqueueAiJob: vi.fn(),
}));
const { enqueueAnalysisForCalls } = vi.hoisted(() => ({
  enqueueAnalysisForCalls: vi.fn(),
}));

vi.mock("../lib/app-data", async () => {
  const actual = await vi.importActual<typeof import("../lib/app-data")>("../lib/app-data");
  return {
    ...actual,
    insertAuditLog,
  };
});

vi.mock("./ai-jobs", () => ({
  enqueueAiJob,
}));

// Mock only the reservation gate; keep the real InsufficientBalanceError + cap so
// the `instanceof` branch and chunking in dispatchImportBatch behave realistically.
vi.mock("./analyze-selection", async () => {
  const actual = await vi.importActual<typeof import("./analyze-selection")>("./analyze-selection");
  return {
    ...actual,
    enqueueAnalysisForCalls,
  };
});

import { dispatchImportBatch } from "./import-dispatch";
import { InsufficientBalanceError } from "./analyze-selection";

type ClientConfig = {
  // Row returned by the atomic claim UPDATE (null = the claim matched no row).
  claimRow?: Record<string, unknown> | null;
  // Row returned by the follow-up status read when the claim is lost.
  statusRow?: Record<string, unknown> | null;
  csv?: string;
  // Per-row result of the calls upsert; null entries simulate a dedup skip.
  callRows?: Array<{ id: string } | null>;
  callError?: { message: string } | null;
};

function createClient(config: ClientConfig) {
  const recorded = {
    batchUpdates: [] as Array<Record<string, unknown>>,
    rowErrors: [] as Array<Record<string, unknown>>,
    downloadCalled: false,
    upsertPayloads: [] as Array<Record<string, unknown>>,
  };
  let callIndex = 0;

  const client = {
    from(table: string) {
      if (table === "import_batches") {
        let isUpdate = false;
        const builder: Record<string, unknown> = {
          update(values: Record<string, unknown>) {
            isUpdate = true;
            recorded.batchUpdates.push(values);
            return builder;
          },
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          in() {
            return builder;
          },
          async maybeSingle() {
            // After update() this is the atomic claim; otherwise the status read.
            return isUpdate
              ? { data: config.claimRow ?? null, error: null }
              : { data: config.statusRow ?? null, error: null };
          },
          // Terminal awaited update (finalization / mark-failed): update().eq().eq()
          then(resolve: (value: { error: null }) => void) {
            resolve({ error: null });
          },
        };
        return builder;
      }

      if (table === "import_row_errors") {
        const builder: Record<string, unknown> = {
          delete() {
            return builder;
          },
          eq() {
            return builder;
          },
          insert(values: Record<string, unknown>) {
            recorded.rowErrors.push(values);
            return Promise.resolve({ error: null });
          },
          then(resolve: (value: { error: null }) => void) {
            resolve({ error: null });
          },
        };
        return builder;
      }

      if (table === "calls") {
        return {
          upsert(payload: Record<string, unknown>) {
            recorded.upsertPayloads.push(payload);
            const result = config.callError
              ? { data: null, error: config.callError }
              : { data: config.callRows?.[callIndex] ?? null, error: null };
            callIndex += 1;
            return {
              select() {
                return this;
              },
              async maybeSingle() {
                return result;
              },
            };
          },
        };
      }

      if (table === "call_source_snapshots" || table === "call_transcripts") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from(bucket: string) {
        expect(bucket).toBe("imports");
        return {
          download: vi.fn(async () => {
            recorded.downloadCalled = true;
            return {
              data: { text: async () => config.csv ?? "" },
              error: null,
            };
          }),
        };
      },
    },
  };

  return { client, recorded };
}

const DISPATCHABLE_BATCH = {
  id: "batch_1",
  filename: "calls.csv",
  storage_path: "org_1/calls.csv",
  source_provider: "custom",
};

describe("dispatchImportBatch", () => {
  beforeEach(() => {
    insertAuditLog.mockReset();
    enqueueAiJob.mockReset();
    enqueueAnalysisForCalls.mockReset();
    enqueueAnalysisForCalls.mockResolvedValue({
      requested: 0,
      transcriptionQueued: 0,
      analysisQueued: 0,
      skipped: [],
    });
  });

  it("enqueues analysis when a CSV row already includes transcript text", async () => {
    const { client } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at,transcript_text",
        "+15555550123,2026-04-11T00:00:00.000Z,\"Agent: Hello. Customer: Hi.\"",
      ].join("\n"),
      callRows: [{ id: "call_1" }],
    });

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });

    expect(result).toMatchObject({ acceptedCount: 1, skippedCount: 0, rejectedCount: 0, status: "completed" });
    expect(enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "analysis",
    });
  });

  it("enqueues transcription when a CSV row includes a recording URL", async () => {
    const { client } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at,recording_url,language",
        "+15555550123,2026-04-11T00:00:00.000Z,https://example.com/call.mp3,en",
      ].join("\n"),
      callRows: [{ id: "call_2" }],
    });

    await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });

    expect(enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_2",
      jobType: "transcription",
      payload: { language: "en" },
    });
  });

  it("imports metadata only (no AI jobs) when enqueueAiJobs is false", async () => {
    const { client } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at,transcript_text,recording_url",
        "+15555550123,2026-04-11T00:00:00.000Z,\"Agent: Hello.\",https://example.com/call.mp3",
        "+15555550999,2026-04-11T00:00:00.000Z,,https://example.com/call2.mp3",
      ].join("\n"),
      callRows: [{ id: "call_1" }, { id: "call_2" }],
    });

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
      enqueueAiJobs: false,
    });

    expect(result).toMatchObject({ acceptedCount: 2, rejectedCount: 0, status: "completed" });
    // The whole point of the safe default: no paid AI is queued on import.
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(enqueueAnalysisForCalls).not.toHaveBeenCalled();
    expect(result.aiQueue).toEqual({ attempted: false });
  });

  it("routes the analyze-on-import opt-in through the reservation gate, not direct enqueue", async () => {
    enqueueAnalysisForCalls.mockResolvedValue({
      requested: 2,
      transcriptionQueued: 1,
      analysisQueued: 1,
      skipped: [],
    });
    const { client } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at,transcript_text,recording_url",
        "+15555550123,2026-04-11T00:00:00.000Z,\"Agent: Hello.\",",
        "+15555550999,2026-04-11T00:00:00.000Z,,https://example.com/call2.mp3",
      ].join("\n"),
      callRows: [{ id: "call_1" }, { id: "call_2" }],
    });

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
      enqueueAiJobs: false,
      analyzeOnImport: true,
    });

    expect(result).toMatchObject({ acceptedCount: 2, status: "completed" });
    // No legacy un-reserved enqueue; the wallet-gated path handles AI.
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(enqueueAnalysisForCalls).toHaveBeenCalledTimes(1);
    expect(enqueueAnalysisForCalls).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callIds: ["call_1", "call_2"],
      actorUserId: "user_1",
    });
    expect(result.aiQueue).toMatchObject({
      attempted: true,
      blocked: false,
      transcriptionQueued: 1,
      analysisQueued: 1,
      skipped: 0,
    });
  });

  it("keeps imported metadata when the wallet blocks the opt-in AI queue", async () => {
    enqueueAnalysisForCalls.mockRejectedValue(new InsufficientBalanceError(500, 100));
    const { client, recorded } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at,recording_url",
        "+15555550123,2026-04-11T00:00:00.000Z,https://example.com/call.mp3",
      ].join("\n"),
      callRows: [{ id: "call_1" }],
    });

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
      enqueueAiJobs: false,
      analyzeOnImport: true,
    });

    // Metadata import still completes — the call was inserted and the batch finalized.
    expect(result).toMatchObject({ acceptedCount: 1, status: "completed" });
    expect(recorded.upsertPayloads).toHaveLength(1);
    // AI queue is reported blocked, not silently enqueued, with add-funds context.
    expect(result.aiQueue).toMatchObject({
      attempted: true,
      blocked: true,
      reason: "insufficient_balance",
      requiredCents: 500,
      availableCents: 100,
    });
  });

  it("does not call the gate for a metadata-only opt-in with no analyzable rows", async () => {
    const { client } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at",
        "+15555550123,2026-04-11T00:00:00.000Z",
      ].join("\n"),
      callRows: [{ id: "call_1" }],
    });

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
      enqueueAiJobs: false,
      analyzeOnImport: true,
    });

    expect(result).toMatchObject({ acceptedCount: 1, status: "completed" });
    expect(enqueueAnalysisForCalls).not.toHaveBeenCalled();
    expect(result.aiQueue).toEqual({ attempted: false });
  });

  it("skips a row whose call already exists (dedup) without erroring or re-enqueuing", async () => {
    const { client, recorded } = createClient({
      claimRow: DISPATCHABLE_BATCH,
      csv: [
        "caller_number,started_at,transcript_text",
        "+15555550123,2026-04-11T00:00:00.000Z,\"Agent: Hello.\"",
      ].join("\n"),
      // upsert with ignoreDuplicates returns no row when the (org, dedupe_hash) already exists.
      callRows: [null],
    });

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });

    expect(result).toMatchObject({ acceptedCount: 0, skippedCount: 1, rejectedCount: 0, status: "completed" });
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(recorded.rowErrors).toHaveLength(0);
    // The upsert targets the dedup unique constraint and does not overwrite existing rows.
    expect(recorded.upsertPayloads).toHaveLength(1);
  });

  it("does not double-process when the batch is already processing (atomic claim lost)", async () => {
    const { client, recorded } = createClient({
      claimRow: null,
      statusRow: { status: "processing" },
    });

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("This batch is already processing. Wait for it to finish before retrying dispatch.");

    expect(recorded.downloadCalled).toBe(false);
    // Only the (no-op) claim attempt ran — no finalization/failed write.
    expect(recorded.batchUpdates).toHaveLength(1);
    expect(recorded.batchUpdates[0]).toMatchObject({ status: "processing" });
  });

  it("rejects dispatch for a non-dispatchable batch (atomic claim lost)", async () => {
    const { client, recorded } = createClient({
      claimRow: null,
      statusRow: { status: "completed" },
    });

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Retry dispatch is only available for uploaded, failed, or partial batches.");

    expect(recorded.downloadCalled).toBe(false);
  });

  it("throws Batch not found when neither the claim nor the status read returns a row", async () => {
    const { client } = createClient({ claimRow: null, statusRow: null });

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "missing",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Batch not found.");
  });

  it("marks the batch failed when the storage path is outside the organization prefix", async () => {
    const { client, recorded } = createClient({
      claimRow: { ...DISPATCHABLE_BATCH, storage_path: "other-org/calls.csv" },
    });

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Import storage path is invalid for this organization.");

    expect(recorded.downloadCalled).toBe(false);
    // claim (processing) then mark-failed.
    expect(recorded.batchUpdates).toHaveLength(2);
    expect(recorded.batchUpdates[0]).toMatchObject({ status: "processing" });
    expect(recorded.batchUpdates[1]).toMatchObject({ status: "failed" });
    expect(insertAuditLog).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ action: "import.dispatch.failed", entityId: "batch_1" })
    );
  });
});
