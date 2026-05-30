import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
  enqueueAiJob: vi.fn(),
}));

vi.mock("../lib/app-data", () => ({ insertAuditLog: mocks.insertAuditLog }));
vi.mock("./ai-jobs", () => ({ enqueueAiJob: mocks.enqueueAiJob }));

import { enqueueAnalysisForCalls } from "./analyze-selection";

interface CallRow {
  id: string;
  recording_url: string | null;
  transcription_status: string;
  duration_seconds?: number;
}

interface BatchRow {
  id: string;
  organizationId: string;
}

interface BillingRow {
  id: string;
  per_minute_rate_cents: number;
}

/** Fake client: calls.select().eq("organization_id").in("id", ids) resolves to org-scoped rows. */
function fakeClient(
  rows: CallRow[],
  batches: BatchRow[] = [],
  billing: BillingRow | null = null,
  balanceCents = 0,
  reserveResult = true
) {
  return {
    // The enqueue gate reserves funds via this RPC (migration 0018).
    rpc: async (name: string, _args: unknown) => {
      if (name === "reserve_calls_for_processing") {
        return { data: reserveResult, error: null };
      }
      throw new Error(`Unexpected rpc: ${name}`);
    },
    from(table: string) {
      if (table === "wallet_processing_holds") {
        // Only read on reservation failure (for the available-balance message);
        // no open holds in these unit fixtures.
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gt: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "calls") {
        return {
          select: () => ({
            eq: (_col: string, _org: string) => ({
              in: async (_idCol: string, ids: string[]) => ({
                data: rows.filter((r) => ids.includes(r.id)),
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "ringba_import_batches") {
        return {
          select: () => ({
            eq: (_idCol: string, id: string) => ({
              eq: (_orgCol: string, org: string) => ({
                maybeSingle: async () => ({
                  data: batches.find((b) => b.id === id && b.organizationId === org) ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "billing_accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: billing, error: null }),
            }),
          }),
        };
      }
      if (table === "wallet_ledger_entries") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { balance_after_cents: balanceCents }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  mocks.insertAuditLog.mockReset();
  mocks.enqueueAiJob.mockReset();
  mocks.enqueueAiJob.mockResolvedValue({ id: "job_1", status: "queued", created: true });
});

describe("enqueueAnalysisForCalls", () => {
  it("queues transcription for calls with a recording and no transcript", async () => {
    const client = fakeClient([
      { id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending" },
    ]);

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1"],
      actorUserId: "user_1",
    });

    expect(result).toMatchObject({ transcriptionQueued: 1, analysisQueued: 0 });
    expect(mocks.enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "transcription",
    });
  });

  it("queues analysis for calls that already have a completed transcript", async () => {
    const client = fakeClient([
      { id: "call_2", recording_url: "https://rec/2.mp3", transcription_status: "completed" },
    ]);

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_2"],
      actorUserId: "user_1",
    });

    expect(result).toMatchObject({ transcriptionQueued: 0, analysisQueued: 1 });
    expect(mocks.enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_2",
      jobType: "analysis",
    });
  });

  it("skips calls with no media", async () => {
    const client = fakeClient([
      { id: "call_3", recording_url: null, transcription_status: "pending" },
    ]);

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_3"],
      actorUserId: "user_1",
    });

    expect(result.skipped).toEqual([{ callId: "call_3", reason: "no_media" }]);
    expect(mocks.enqueueAiJob).not.toHaveBeenCalled();
  });

  it("treats calls not returned by the org-scoped query as not_in_org (tenant isolation)", async () => {
    // Requested call_x belongs to another org → not returned by the org-scoped select.
    const client = fakeClient([
      { id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending" },
    ]);

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1", "call_x"],
      actorUserId: "user_1",
    });

    expect(result.transcriptionQueued).toBe(1);
    expect(result.skipped).toEqual([{ callId: "call_x", reason: "not_in_org" }]);
  });

  it("enforces the max batch size", async () => {
    const client = fakeClient([]);
    await expect(
      enqueueAnalysisForCalls(client as never, {
        organizationId: "org_1",
        callIds: ["a", "b", "c"],
        actorUserId: "user_1",
        maxBatchSize: 2,
      })
    ).rejects.toThrow("Too many calls selected");
    expect(mocks.enqueueAiJob).not.toHaveBeenCalled();
  });

  it("dedupes requested call ids before counting", async () => {
    const client = fakeClient([
      { id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending" },
    ]);

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1", "call_1"],
      actorUserId: "user_1",
    });

    expect(result.requested).toBe(1);
    expect(mocks.enqueueAiJob).toHaveBeenCalledTimes(1);
  });

  it("writes a uuid (org id) audit entity_id for an ad-hoc selection, not a string", async () => {
    // Regression: audit_logs.entity_id is a NOT NULL uuid; writing the literal
    // "analyze_selected" made every analyze-selected call 400 ("Unable to record
    // audit log.") after enqueuing the job.
    const client = fakeClient([
      { id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "completed" },
    ]);

    await enqueueAnalysisForCalls(client as never, {
      organizationId: "11111111-1111-1111-1111-111111111111",
      callIds: ["call_1"],
      actorUserId: "user_1",
    });

    expect(mocks.insertAuditLog).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        entityType: "organization",
        entityId: "11111111-1111-1111-1111-111111111111",
        action: "calls.analyze_selected",
      })
    );
  });

  it("points the audit entity at the import batch uuid when a batch is supplied", async () => {
    const client = fakeClient(
      [{ id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "completed" }],
      [{ id: "22222222-2222-2222-2222-222222222222", organizationId: "org_1" }]
    );

    await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1"],
      importBatchId: "22222222-2222-2222-2222-222222222222",
      actorUserId: "user_1",
    });

    expect(mocks.insertAuditLog).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        entityType: "ringba_import_batch",
        entityId: "22222222-2222-2222-2222-222222222222",
      })
    );
  });

  it("accepts an importBatchId that belongs to the org", async () => {
    const client = fakeClient(
      [{ id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending" }],
      [{ id: "batch_1", organizationId: "org_1" }]
    );

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1"],
      importBatchId: "batch_1",
      actorUserId: "user_1",
    });

    expect(result.transcriptionQueued).toBe(1);
  });

  it("rejects an importBatchId from another org without queueing anything", async () => {
    const client = fakeClient(
      [{ id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending" }],
      [{ id: "batch_1", organizationId: "org_other" }]
    );

    await expect(
      enqueueAnalysisForCalls(client as never, {
        organizationId: "org_1",
        callIds: ["call_1"],
        importBatchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Import batch not found.");
    expect(mocks.enqueueAiJob).not.toHaveBeenCalled();
  });

  it("rejects an unknown importBatchId", async () => {
    const client = fakeClient([
      { id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending" },
    ]);

    await expect(
      enqueueAnalysisForCalls(client as never, {
        organizationId: "org_1",
        callIds: ["call_1"],
        importBatchId: "ghost_batch",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Import batch not found.");
    expect(mocks.enqueueAiJob).not.toHaveBeenCalled();
  });

  it("blocks (InsufficientBalanceError) when the reservation cannot be taken", async () => {
    // 1 call, 60s -> 1 billable minute at 100c = 100c estimate; reservation
    // fails (insufficient available) and the message reports available = 50c.
    const client = fakeClient(
      [{ id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending", duration_seconds: 60 }],
      [],
      { id: "ba_1", per_minute_rate_cents: 100 },
      50,
      false // reserve fails
    );

    await expect(
      enqueueAnalysisForCalls(client as never, {
        organizationId: "org_1",
        callIds: ["call_1"],
        actorUserId: "user_1",
      })
    ).rejects.toMatchObject({ name: "InsufficientBalanceError", requiredCents: 100, availableCents: 50 });
    expect(mocks.enqueueAiJob).not.toHaveBeenCalled();
  });

  it("queues when the reservation succeeds (balance covers the estimate)", async () => {
    const client = fakeClient(
      [{ id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending", duration_seconds: 60 }],
      [],
      { id: "ba_1", per_minute_rate_cents: 100 },
      1000,
      true // reserve succeeds
    );

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1"],
      actorUserId: "user_1",
    });

    expect(result.transcriptionQueued).toBe(1);
    expect(mocks.enqueueAiJob).toHaveBeenCalledTimes(1);
  });

  it("does not block when no billing account is configured (can't meter)", async () => {
    const client = fakeClient([
      { id: "call_1", recording_url: "https://rec/1.mp3", transcription_status: "pending", duration_seconds: 600 },
    ]); // billing = null

    const result = await enqueueAnalysisForCalls(client as never, {
      organizationId: "org_1",
      callIds: ["call_1"],
      actorUserId: "user_1",
    });

    expect(result.transcriptionQueued).toBe(1);
  });
});
