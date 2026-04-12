import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAdminSupabase,
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  loadIntegrationContextByRingbaPublicIngestKey,
  parseRingbaPixelRequest,
  recordIntegrationFailure,
} = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(),
  getRingbaMinimumDurationSeconds: vi.fn(),
  ingestIntegrationCalls: vi.fn(),
  loadIntegrationContextByRingbaPublicIngestKey: vi.fn(),
  parseRingbaPixelRequest: vi.fn(),
  recordIntegrationFailure: vi.fn(),
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/server/integration-ingest", () => ({
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  loadIntegrationContextByRingbaPublicIngestKey,
  parseRingbaPixelRequest,
  recordIntegrationFailure,
}));

import { GET, POST } from "../../src/pages/api/integrations/ringba/pixel";

function createApiContext(request: Request): APIContext {
  return { request } as APIContext;
}

describe("/api/integrations/ringba/pixel", () => {
  beforeEach(() => {
    getAdminSupabase.mockReset();
    getRingbaMinimumDurationSeconds.mockReset();
    ingestIntegrationCalls.mockReset();
    loadIntegrationContextByRingbaPublicIngestKey.mockReset();
    parseRingbaPixelRequest.mockReset();
    recordIntegrationFailure.mockReset();
  });

  it("returns 405 for POST requests", async () => {
    const response = await POST(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel", { method: "POST" }))
    );

    expect(response.status).toBe(405);
  });

  it("returns 400 when the query string is invalid", async () => {
    parseRingbaPixelRequest.mockImplementation(() => {
      throw new Error("api_key query parameter is required.");
    });

    const response = await GET(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel?platform=ringba"))
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "api_key query parameter is required.",
    });
  });

  it("returns 404 when no Ringba integration matches the public ingest key", async () => {
    const admin = { name: "admin" };
    getAdminSupabase.mockReturnValue(admin);
    parseRingbaPixelRequest.mockReturnValue({
      apiKey: "ringba_live_key",
      payload: { provider: "ringba", calls: [] },
      calls: [],
      durationSeconds: 45,
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(null);

    const response = await GET(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key"))
    );

    expect(response.status).toBe(404);
  });

  it("returns a benign skip response for short Ringba calls", async () => {
    const admin = { name: "admin" };
    const integration = {
      id: "integration_1",
      organizationId: "org_1",
      provider: "ringba",
      displayName: "Ringba Primary",
      config: {},
    };
    getAdminSupabase.mockReturnValue(admin);
    parseRingbaPixelRequest.mockReturnValue({
      apiKey: "ringba_live_key",
      payload: { provider: "ringba", calls: [] },
      calls: [],
      durationSeconds: 12,
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(integration);
    getRingbaMinimumDurationSeconds.mockReturnValue(30);

    const response = await GET(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key"))
    );

    expect(response.status).toBe(200);
    expect(ingestIntegrationCalls).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: "below_minimum_duration",
      minimumDurationSeconds: 30,
      receivedDurationSeconds: 12,
    });
  });

  it("ingests normalized Ringba calls through the shared pipeline", async () => {
    const admin = { name: "admin" };
    const integration = {
      id: "integration_1",
      organizationId: "org_1",
      provider: "ringba",
      displayName: "Ringba Primary",
      config: {},
    };
    const payload = {
      provider: "ringba",
      platform: "ringba",
      calls: [{ callerNumber: "+15555550123" }],
    };
    const calls = [{ callerNumber: "+15555550123" }];
    getAdminSupabase.mockReturnValue(admin);
    parseRingbaPixelRequest.mockReturnValue({
      apiKey: "ringba_live_key",
      payload,
      calls,
      durationSeconds: 45,
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(integration);
    getRingbaMinimumDurationSeconds.mockReturnValue(30);
    ingestIntegrationCalls.mockResolvedValue({
      statusCode: 200,
      ingestedCount: 1,
      rejectedCount: 0,
      eventId: "event_1",
    });

    const response = await GET(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key"))
    );

    expect(ingestIntegrationCalls).toHaveBeenCalledWith(admin, integration, payload, calls);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: false,
      ingestedCount: 1,
      rejectedCount: 0,
      eventId: "event_1",
    });
  });
});
