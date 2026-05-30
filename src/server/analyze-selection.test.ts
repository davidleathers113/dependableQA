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
}

/** Fake client: calls.select().eq("organization_id").in("id", ids) resolves to org-scoped rows. */
function fakeClient(rows: CallRow[]) {
  return {
    from(table: string) {
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
});
