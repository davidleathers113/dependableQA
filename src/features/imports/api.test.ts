import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchImportBatchRequest, parseAiQueue } from "./api";

describe("parseAiQueue", () => {
  it("defaults to a safe not-attempted shape for missing/invalid input", () => {
    expect(parseAiQueue(undefined)).toEqual({
      attempted: false,
      blocked: false,
      reason: null,
      transcriptionQueued: 0,
      analysisQueued: 0,
      skipped: 0,
      requiredCents: null,
      availableCents: null,
    });
    expect(parseAiQueue("nope").attempted).toBe(false);
  });

  it("preserves a blocked insufficient-balance outcome", () => {
    expect(
      parseAiQueue({
        attempted: true,
        blocked: true,
        reason: "insufficient_balance",
        requiredCents: 500,
        availableCents: 100,
        transcriptionQueued: 0,
        analysisQueued: 0,
        skipped: 0,
      })
    ).toMatchObject({
      attempted: true,
      blocked: true,
      reason: "insufficient_balance",
      requiredCents: 500,
      availableCents: 100,
    });
  });
});

describe("dispatchImportBatchRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("preserves aiQueue from the dispatch response", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        acceptedCount: 2,
        rejectedCount: 0,
        rowCountTotal: 2,
        status: "completed",
        aiQueue: {
          attempted: true,
          blocked: true,
          reason: "insufficient_balance",
          requiredCents: 500,
          availableCents: 100,
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await dispatchImportBatchRequest("batch_1", true);

    expect(result.acceptedCount).toBe(2);
    expect(result.aiQueue).toMatchObject({
      attempted: true,
      blocked: true,
      reason: "insufficient_balance",
    });
    // The opt-in flag is forwarded to the server.
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ batchId: "batch_1", analyzeOnImport: true });
  });

  it("normalizes a metadata-only response to a not-attempted aiQueue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ acceptedCount: 1, rejectedCount: 0, rowCountTotal: 1, status: "completed" }))
    );

    const result = await dispatchImportBatchRequest("batch_1");
    expect(result.aiQueue.attempted).toBe(false);
  });

  it("throws with the status code on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "dispatch failed" }, 500))
    );

    await expect(dispatchImportBatchRequest("batch_1")).rejects.toThrow("dispatch failed");
  });
});
