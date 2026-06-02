import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IntegrationContext } from "./integration-ingest";
import {
  buildRetreaverIngestPayload,
  ingestRetreaverWebhookCall,
  verifyRetreaverWebhookRequest,
} from "./retreaver-ingest";

const integration: IntegrationContext = {
  id: "int-1",
  organizationId: "org-1",
  provider: "retreaver",
  displayName: "Retreaver",
  config: {},
};

const validPayload = {
  call_uuid: "rt-1",
  caller_id: "+15555551234",
  created_at: "2026-06-01T12:00:00.000Z",
  duration: 90,
  recording_url: "https://recordings.retreaver.com/rt-1.mp3",
  publisher: "Affiliate A",
};

function ingestResult(overrides: Record<string, unknown> = {}) {
  return {
    ingestedCount: 1,
    rejectedCount: 0,
    recordingCount: 1,
    importedCallIds: ["call-1"],
    eventId: "evt-1",
    statusCode: 200,
    ...overrides,
  };
}

describe("buildRetreaverIngestPayload", () => {
  it("wraps a normalized call with consistent retreaver ingest metadata", () => {
    const built = buildRetreaverIngestPayload(validPayload);
    expect(built).not.toBeNull();
    expect(built?.payload).toEqual({
      provider: "retreaver",
      platform: "retreaver",
      ingestionMode: "webhook",
      eventType: "retreaver.webhook.call",
      callsReceived: 1,
      callsNormalized: 1,
    });
    expect(built?.calls).toHaveLength(1);
    expect(built?.invalidPayloadCount).toBe(0);
    expect(built?.calls[0]).toMatchObject({
      externalCallId: "rt-1",
      callerNumber: "+15555551234",
      recordingUrl: "https://recordings.retreaver.com/rt-1.mp3",
    });
  });

  it("unwraps an explicit Retreaver calls batch and skips invalid entries before ingest", () => {
    const built = buildRetreaverIngestPayload({
      calls: [
        validPayload,
        { call_uuid: "missing-caller", created_at: "2026-06-01T12:00:00.000Z" },
        {
          call_uuid: "rt-2",
          caller_id: "+15555550002",
          created_at: "2026-06-01T13:00:00.000Z",
          duration: 45,
        },
      ],
    });

    expect(built).not.toBeNull();
    expect(built?.payload).toMatchObject({
      provider: "retreaver",
      eventType: "retreaver.webhook.batch",
      callsReceived: 3,
      callsNormalized: 2,
    });
    expect(built?.calls).toHaveLength(2);
    expect(built?.calls.map((call) => call.externalCallId)).toEqual(["rt-1", "rt-2"]);
    expect(built?.invalidPayloadCount).toBe(1);
  });

  it("returns null when the payload cannot be normalized", () => {
    expect(buildRetreaverIngestPayload({ created_at: "2026-06-01T00:00:00Z" })).toBeNull();
  });
});

describe("ingestRetreaverWebhookCall", () => {
  it("ingests a valid payload metadata-only (enqueueAiJobs: false)", async () => {
    const ingestImpl = vi.fn(async () => ingestResult());
    const client = { name: "client" } as never;

    const result = await ingestRetreaverWebhookCall({
      client,
      integration,
      payload: validPayload,
      ingestImpl,
    });

    expect(result).toEqual({
      status: "ingested",
      ingestedCount: 1,
      rejectedCount: 0,
      recordingCount: 1,
      importedCallIds: ["call-1"],
      invalidPayloadCount: 0,
    });

    expect(ingestImpl).toHaveBeenCalledTimes(1);
    expect(ingestImpl).toHaveBeenCalledWith(
      client,
      integration,
      expect.objectContaining({ provider: "retreaver", ingestionMode: "webhook" }),
      expect.arrayContaining([expect.objectContaining({ callerNumber: "+15555551234" })]),
      // The load-bearing cost-control guarantee.
      { enqueueAiJobs: false }
    );
  });

  it("ignores an invalid payload without throwing or calling ingest", async () => {
    const ingestImpl = vi.fn(async () => ingestResult());

    const result = await ingestRetreaverWebhookCall({
      client: {} as never,
      integration,
      payload: { caller_id: "+1", created_at: "not-a-date" },
      ingestImpl,
    });

    expect(result).toEqual({ status: "ignored", reason: "invalid_payload" });
    expect(ingestImpl).not.toHaveBeenCalled();
  });

  it("surfaces ingest rejection counts (e.g. a fully-rejected call)", async () => {
    const ingestImpl = vi.fn(async () => ingestResult({ ingestedCount: 0, rejectedCount: 1, recordingCount: 0, importedCallIds: [] }));

    const result = await ingestRetreaverWebhookCall({
      client: {} as never,
      integration,
      payload: validPayload,
      ingestImpl,
    });

    expect(result).toMatchObject({ status: "ingested", ingestedCount: 0, rejectedCount: 1 });
  });

  it("ingests valid entries from a batch metadata-only and includes skipped entries in rejectedCount", async () => {
    const ingestImpl = vi.fn(async () => ingestResult({ ingestedCount: 2, recordingCount: 1, importedCallIds: ["call-1", "call-2"] }));

    const result = await ingestRetreaverWebhookCall({
      client: {} as never,
      integration,
      payload: {
        calls: [
          validPayload,
          { call_uuid: "missing-caller", created_at: "2026-06-01T12:00:00.000Z" },
          { call_uuid: "rt-2", caller_id: "+15555550002", created_at: "2026-06-01T13:00:00.000Z" },
        ],
      },
      ingestImpl,
    });

    expect(result).toMatchObject({
      status: "ingested",
      ingestedCount: 2,
      rejectedCount: 1,
      invalidPayloadCount: 1,
    });
    expect(ingestImpl).toHaveBeenCalledWith(
      {},
      integration,
      expect.objectContaining({ eventType: "retreaver.webhook.batch", callsReceived: 3, callsNormalized: 2 }),
      expect.arrayContaining([
        expect.objectContaining({ externalCallId: "rt-1" }),
        expect.objectContaining({ externalCallId: "rt-2" }),
      ]),
      { enqueueAiJobs: false }
    );
  });
});

describe("verifyRetreaverWebhookRequest", () => {
  const DEFAULT_HEADER = "x-dependableqa-signature";

  // Keep the env-derived default secret out of the "not configured" path.
  afterEach(() => vi.unstubAllEnvs());

  function withConfig(config: Record<string, unknown>): IntegrationContext {
    return { ...integration, config: config as never };
  }

  it("accepts a matching shared-secret header", () => {
    const ctx = withConfig({ sharedSecret: "topsecret" });
    expect(verifyRetreaverWebhookRequest(ctx, { [DEFAULT_HEADER]: "topsecret" }, "")).toEqual({ ok: true });
  });

  it("accepts a matching HMAC-SHA256 signature (delegates to the shared crypto path)", () => {
    const body = JSON.stringify({ caller_id: "+1" });
    const expected = `sha256=${createHmac("sha256", "hmacsecret").update(body).digest("hex")}`;
    const ctx = withConfig({ webhookAuth: { type: "hmac-sha256", secret: "hmacsecret" } });
    expect(verifyRetreaverWebhookRequest(ctx, { [DEFAULT_HEADER]: expected }, body)).toEqual({ ok: true });
  });

  it("rejects a wrong shared secret with a labeled, secret-free message", () => {
    const ctx = withConfig({ sharedSecret: "topsecret" });
    const result = verifyRetreaverWebhookRequest(ctx, { [DEFAULT_HEADER]: "wrong" }, "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Retreaver webhook");
      expect(result.error).not.toContain("topsecret");
    }
  });

  it("rejects a missing signature header", () => {
    const ctx = withConfig({ sharedSecret: "topsecret" });
    const result = verifyRetreaverWebhookRequest(ctx, {}, "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Retreaver webhook");
    }
  });

  it("fails closed when no signing secret is configured", () => {
    vi.stubEnv("INTEGRATION_INGEST_SHARED_SECRET", "");
    const result = verifyRetreaverWebhookRequest(withConfig({}), { [DEFAULT_HEADER]: "anything" }, "");
    expect(result).toEqual({ ok: false, error: "Retreaver webhook verification is not configured (no signing secret)." });
  });
});
