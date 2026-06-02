import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getWebhookAuthConfig,
  ingestIntegrationCalls,
  loadIntegrationContext,
  parseWebhookPayload,
  recordIntegrationFailure,
  verifyWebhookRequest,
  ingestRetreaverWebhookCall,
  getAdminSupabase,
} = vi.hoisted(() => ({
  getWebhookAuthConfig: vi.fn(),
  ingestIntegrationCalls: vi.fn(),
  loadIntegrationContext: vi.fn(),
  parseWebhookPayload: vi.fn(),
  recordIntegrationFailure: vi.fn(),
  verifyWebhookRequest: vi.fn(),
  ingestRetreaverWebhookCall: vi.fn(),
  getAdminSupabase: vi.fn(),
}));

vi.mock("../../src/server/integration-ingest", () => ({
  getWebhookAuthConfig,
  ingestIntegrationCalls,
  loadIntegrationContext,
  parseWebhookPayload,
  recordIntegrationFailure,
  verifyWebhookRequest,
}));

vi.mock("../../src/server/retreaver-ingest", () => ({
  ingestRetreaverWebhookCall,
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

import { handler } from "../../netlify/functions/integration-ingest";

const RETREAVER_INTEGRATION = {
  id: "int-1",
  organizationId: "org-1",
  provider: "retreaver",
  displayName: "Retreaver",
  config: {},
};

function event(body: unknown, headers: Record<string, string> = { "x-integration-id": "int-1" }) {
  return {
    httpMethod: "POST",
    headers,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function baseHappyPath(payload: Record<string, unknown>) {
  getAdminSupabase.mockReturnValue({ name: "admin" });
  loadIntegrationContext.mockResolvedValue(RETREAVER_INTEGRATION);
  getWebhookAuthConfig.mockReturnValue({ type: "shared-secret", secret: "s", headerName: "x-sig", prefix: "" });
  verifyWebhookRequest.mockReturnValue({ ok: true });
  parseWebhookPayload.mockReturnValue({ payload, payloadProvider: null, calls: [] });
}

describe("integration-ingest webhook handler — Retreaver routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes a verified Retreaver webhook through the metadata-only adapter (not the generic ingest)", async () => {
    const payload = { call_uuid: "rt-1", caller_id: "+15555551234", created_at: "2026-06-01T12:00:00Z" };
    baseHappyPath(payload);
    ingestRetreaverWebhookCall.mockResolvedValue({
      status: "ingested",
      ingestedCount: 1,
      rejectedCount: 0,
      recordingCount: 0,
      importedCallIds: ["c1"],
    });

    const response = await handler(event(payload));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, ingestedCount: 1, rejectedCount: 0 });
    // The adapter handles tenant scoping via the loaded integration; org is never body-supplied.
    expect(ingestRetreaverWebhookCall).toHaveBeenCalledWith({
      client: { name: "admin" },
      integration: RETREAVER_INTEGRATION,
      payload,
    });
    // Load-bearing: the generic webhook ingest (which would default enqueueAiJobs:true) is bypassed.
    expect(ingestIntegrationCalls).not.toHaveBeenCalled();
  });

  it("routes a verified Retreaver batch through the same adapter and reports partial rejects", async () => {
    const payload = {
      calls: [
        { call_uuid: "rt-1", caller_id: "+15555551234", created_at: "2026-06-01T12:00:00Z" },
        { call_uuid: "missing-caller", created_at: "2026-06-01T12:30:00Z" },
      ],
    };
    baseHappyPath(payload);
    ingestRetreaverWebhookCall.mockResolvedValue({
      status: "ingested",
      ingestedCount: 1,
      rejectedCount: 1,
      recordingCount: 0,
      importedCallIds: ["c1"],
      invalidPayloadCount: 1,
    });

    const response = await handler(event(payload));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: false, ingestedCount: 1, rejectedCount: 1 });
    expect(ingestRetreaverWebhookCall).toHaveBeenCalledWith({
      client: { name: "admin" },
      integration: RETREAVER_INTEGRATION,
      payload,
    });
    expect(ingestIntegrationCalls).not.toHaveBeenCalled();
  });

  it("returns 400 for an unusable Retreaver payload and records a non-leaky failure", async () => {
    const payload = { created_at: "2026-06-01T12:00:00Z" }; // no caller
    baseHappyPath(payload);
    ingestRetreaverWebhookCall.mockResolvedValue({ status: "ignored", reason: "invalid_payload" });

    const response = await handler(event(payload));

    expect(response.statusCode).toBe(400);
    expect(recordIntegrationFailure).toHaveBeenCalledWith(
      { name: "admin" },
      RETREAVER_INTEGRATION,
      expect.objectContaining({ payload: { reason: "invalid_payload" } })
    );
    expect(ingestIntegrationCalls).not.toHaveBeenCalled();
  });

  it("rejects with 401 on auth failure before any Retreaver ingest, with no secret in the error", async () => {
    baseHappyPath({ caller_id: "+1" });
    getWebhookAuthConfig.mockReturnValue({
      type: "shared-secret",
      secret: "RETREAVER_TOPSECRET_123",
      headerName: "x-sig",
      prefix: "",
    });
    verifyWebhookRequest.mockReturnValue({ ok: false, error: "Webhook signature did not match." });

    const response = await handler(event({ caller_id: "+1" }));

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("RETREAVER_TOPSECRET_123"); // the secret value never leaks
    expect(JSON.parse(response.body).error).toBe("Webhook signature did not match.");
    expect(ingestRetreaverWebhookCall).not.toHaveBeenCalled();
  });

  it("leaves non-Retreaver providers on the generic ingest path (unchanged)", async () => {
    getAdminSupabase.mockReturnValue({ name: "admin" });
    loadIntegrationContext.mockResolvedValue({ ...RETREAVER_INTEGRATION, provider: "custom", displayName: "Custom" });
    getWebhookAuthConfig.mockReturnValue({ type: "shared-secret", secret: "s", headerName: "x-sig", prefix: "" });
    verifyWebhookRequest.mockReturnValue({ ok: true });
    parseWebhookPayload.mockReturnValue({
      payload: { provider: "custom" },
      payloadProvider: null,
      calls: [{ callerNumber: "+1" }],
    });
    ingestIntegrationCalls.mockResolvedValue({ statusCode: 200, ingestedCount: 1, rejectedCount: 0, eventId: "e1" });

    const response = await handler(event({ callerNumber: "+1" }));

    expect(response.statusCode).toBe(200);
    expect(ingestIntegrationCalls).toHaveBeenCalledTimes(1);
    expect(ingestRetreaverWebhookCall).not.toHaveBeenCalled();
  });
});
