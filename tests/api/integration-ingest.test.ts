import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAdminSupabase,
  getWebhookAuthConfig,
  ingestIntegrationCalls,
  loadIntegrationContext,
  parseWebhookPayload,
  recordIntegrationFailure,
  verifyWebhookRequest,
} = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(),
  getWebhookAuthConfig: vi.fn(),
  ingestIntegrationCalls: vi.fn(),
  loadIntegrationContext: vi.fn(),
  parseWebhookPayload: vi.fn(),
  recordIntegrationFailure: vi.fn(),
  verifyWebhookRequest: vi.fn(),
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/server/integration-ingest", () => ({
  getWebhookAuthConfig,
  ingestIntegrationCalls,
  loadIntegrationContext,
  parseWebhookPayload,
  recordIntegrationFailure,
  verifyWebhookRequest,
}));

import { handler } from "../../netlify/functions/integration-ingest";

describe("integration-ingest handler", () => {
  beforeEach(() => {
    getAdminSupabase.mockReset();
    getWebhookAuthConfig.mockReset();
    ingestIntegrationCalls.mockReset();
    loadIntegrationContext.mockReset();
    parseWebhookPayload.mockReset();
    recordIntegrationFailure.mockReset();
    verifyWebhookRequest.mockReset();
  });

  it("returns 400 when the integration header is missing", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
      headers: {},
    });

    expect(response.statusCode).toBe(400);
    expect(loadIntegrationContext).not.toHaveBeenCalled();
  });

  it("returns 503 when webhook auth is not configured", async () => {
    const admin = { name: "admin" };
    getAdminSupabase.mockReturnValue(admin);
    loadIntegrationContext.mockResolvedValue({
      id: "integration_1",
      organizationId: "org_1",
      provider: "custom",
      displayName: "Primary",
      config: {},
    });
    getWebhookAuthConfig.mockReturnValue(null);

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ calls: [{ callerNumber: "15551234567" }] }),
      headers: {
        "x-integration-id": "integration_1",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(recordIntegrationFailure).toHaveBeenCalledOnce();
  });

  it("returns 401 when signature verification fails", async () => {
    const admin = { name: "admin" };
    getAdminSupabase.mockReturnValue(admin);
    loadIntegrationContext.mockResolvedValue({
      id: "integration_1",
      organizationId: "org_1",
      provider: "custom",
      displayName: "Primary",
      config: {},
    });
    getWebhookAuthConfig.mockReturnValue({
      type: "hmac-sha256",
      secret: "secret",
      headerName: "x-dependableqa-signature",
      prefix: "sha256=",
    });
    verifyWebhookRequest.mockReturnValue({
      ok: false,
      error: "Webhook signature did not match.",
    });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ calls: [{ callerNumber: "15551234567" }] }),
      headers: {
        "x-integration-id": "integration_1",
        "x-dependableqa-signature": "sha256=bad",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(recordIntegrationFailure).toHaveBeenCalledOnce();
    expect(parseWebhookPayload).not.toHaveBeenCalled();
  });

  it("returns 400 when the payload provider does not match the integration", async () => {
    const admin = { name: "admin" };
    getAdminSupabase.mockReturnValue(admin);
    loadIntegrationContext.mockResolvedValue({
      id: "integration_1",
      organizationId: "org_1",
      provider: "custom",
      displayName: "Primary",
      config: {},
    });
    getWebhookAuthConfig.mockReturnValue({
      type: "hmac-sha256",
      secret: "secret",
      headerName: "x-dependableqa-signature",
      prefix: "sha256=",
    });
    verifyWebhookRequest.mockReturnValue({ ok: true });
    parseWebhookPayload.mockReturnValue({
      payload: { provider: "ringba", calls: [{ callerNumber: "15551234567" }] },
      payloadProvider: "ringba",
      calls: [{ callerNumber: "15551234567" }],
    });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ provider: "ringba", calls: [{ callerNumber: "15551234567" }] }),
      headers: {
        "x-integration-id": "integration_1",
        "x-dependableqa-signature": "sha256=good",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(ingestIntegrationCalls).not.toHaveBeenCalled();
  });

  it("returns ingest results for a verified payload", async () => {
    const admin = { name: "admin" };
    getAdminSupabase.mockReturnValue(admin);
    loadIntegrationContext.mockResolvedValue({
      id: "integration_1",
      organizationId: "org_1",
      provider: "custom",
      displayName: "Primary",
      config: {},
    });
    getWebhookAuthConfig.mockReturnValue({
      type: "hmac-sha256",
      secret: "secret",
      headerName: "x-dependableqa-signature",
      prefix: "sha256=",
    });
    verifyWebhookRequest.mockReturnValue({ ok: true });
    parseWebhookPayload.mockReturnValue({
      payload: { calls: [{ callerNumber: "15551234567" }] },
      payloadProvider: null,
      calls: [{ callerNumber: "15551234567" }],
    });
    ingestIntegrationCalls.mockResolvedValue({
      statusCode: 200,
      ingestedCount: 1,
      rejectedCount: 0,
      eventId: "event_1",
    });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ calls: [{ callerNumber: "15551234567" }] }),
      headers: {
        "x-integration-id": "integration_1",
        "x-dependableqa-signature": "sha256=good",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      ingestedCount: 1,
      rejectedCount: 0,
      eventId: "event_1",
    });
  });
});
