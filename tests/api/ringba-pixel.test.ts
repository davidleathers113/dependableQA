import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAdminSupabase,
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  loadIntegrationContextByRingbaPublicIngestKey,
  parseRingbaPixelRequest,
  recordIntegrationEvent,
  recordIntegrationFailure,
} = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(),
  getRingbaMinimumDurationSeconds: vi.fn(),
  ingestIntegrationCalls: vi.fn(),
  loadIntegrationContextByRingbaPublicIngestKey: vi.fn(),
  parseRingbaPixelRequest: vi.fn(),
  recordIntegrationEvent: vi.fn(),
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
  recordIntegrationEvent,
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
    recordIntegrationEvent.mockReset();
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
    expect(recordIntegrationEvent).not.toHaveBeenCalled();
  });

  it("records pixel.rejected when a known Ringba integration sends an invalid query", async () => {
    const admin = { name: "admin" };
    const integration = {
      id: "integration_1",
      organizationId: "org_1",
      provider: "ringba",
      displayName: "Ringba Primary",
      config: {},
    };
    getAdminSupabase.mockReturnValue(admin);
    parseRingbaPixelRequest.mockImplementation(() => {
      throw new Error("call_timestamp must be a valid date/time value.");
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(integration);

    const response = await GET(
      createApiContext(
        new Request(
          "http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=ringba&call_id=call_123&caller_number=%2B15555550123&duration_seconds=61&recording_url=https%3A%2F%2Fexample.com%2Frecording.mp3&campaign_name=Alpha&call_timestamp=not-a-date&publisher_name=PubOne&buyer_name=BuyerOne"
        )
      )
    );

    expect(response.status).toBe(400);
    expect(loadIntegrationContextByRingbaPublicIngestKey).toHaveBeenCalledWith(admin, "ringba_live_key");
    expect(recordIntegrationEvent).toHaveBeenCalledWith(admin, integration, {
      eventType: "pixel.rejected",
      message: "Rejected Ringba Primary Ringba pixel: call_timestamp must be a valid date/time value.",
      severity: "warning",
      payload: {
        reason: "invalid_query",
        parseError: "call_timestamp must be a valid date/time value.",
        requestQuery: {
          platform: "ringba",
          call_id: "call_123",
          duration_seconds: "61",
          campaign_name: "Alpha",
          call_timestamp: "not-a-date",
          call_connection_dt: "",
          callConnectionDt: "",
          publisher_name: "PubOne",
          buyer_name: "BuyerOne",
          caller_number_present: true,
          recording_url_present: true,
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      error: "call_timestamp must be a valid date/time value.",
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
    expect(recordIntegrationEvent).toHaveBeenCalledWith(admin, integration, {
      eventType: "pixel.skipped",
      message: "Skipped Ringba Primary Ringba pixel because the call was below the minimum duration threshold.",
      severity: "info",
      payload: {
        reason: "below_minimum_duration",
        minimumDurationSeconds: 30,
        receivedDurationSeconds: 12,
      },
    });
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
      createApiContext(
        new Request(
          "http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=ringba&call_id=call_123&caller_number=%2B15555550123&duration_seconds=61&recording_url=https%3A%2F%2Fexample.com%2Frecording.mp3&campaign_name=Alpha&call_timestamp=2026-04-11T00%3A00%3A00.000Z&publisher_name=PubOne&buyer_name=BuyerOne"
        )
      )
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

  it("surfaces partial or rejected ingest results instead of masking them as success", async () => {
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
      payload: { provider: "ringba", platform: "ringba", calls: [{ callerNumber: "+15555550123" }] },
      calls: [{ callerNumber: "+15555550123" }],
      durationSeconds: 61,
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(integration);
    getRingbaMinimumDurationSeconds.mockReturnValue(30);
    ingestIntegrationCalls.mockResolvedValue({
      statusCode: 422,
      ingestedCount: 0,
      rejectedCount: 1,
      eventId: "event_rejected",
    });

    const response = await GET(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key"))
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      skipped: false,
      ingestedCount: 0,
      rejectedCount: 1,
      eventId: "event_rejected",
    });
  });

  it("records pixel.failed when the shared ingest pipeline throws", async () => {
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
      payload: { provider: "ringba", platform: "ringba", calls: [{ callerNumber: "+15555550123" }] },
      calls: [{ callerNumber: "+15555550123" }],
      durationSeconds: 61,
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(integration);
    getRingbaMinimumDurationSeconds.mockReturnValue(30);
    ingestIntegrationCalls.mockRejectedValue(new Error("Unable to write call record."));

    const response = await GET(
      createApiContext(new Request("http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key"))
    );

    expect(response.status).toBe(500);
    expect(recordIntegrationFailure).toHaveBeenCalledWith(admin, integration, {
      eventType: "pixel.failed",
      message: "Failed to process Ringba Primary Ringba pixel: Unable to write call record.",
      payload: {
        reason: "processing_failure",
      },
      status: "error",
      errorType: "integration.pixel.failed",
    });
    await expect(response.json()).resolves.toEqual({
      error: "Unable to write call record.",
    });
  });

  it("passes the full Ringba query string to the Ringba parser", async () => {
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
      payload: { provider: "ringba", platform: "ringba", calls: [{ callerNumber: "+15555550123" }] },
      calls: [{ callerNumber: "+15555550123" }],
      durationSeconds: 61,
    });
    loadIntegrationContextByRingbaPublicIngestKey.mockResolvedValue(integration);
    getRingbaMinimumDurationSeconds.mockReturnValue(30);
    ingestIntegrationCalls.mockResolvedValue({
      statusCode: 200,
      ingestedCount: 1,
      rejectedCount: 0,
      eventId: "event_1",
    });

    await GET(
      createApiContext(
        new Request(
          "http://localhost/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=ringba&call_id=call_123&caller_number=%2B15555550123&duration_seconds=61&recording_url=https%3A%2F%2Fexample.com%2Frecording.mp3&campaign_name=Alpha&call_timestamp=2026-04-11T00%3A00%3A00.000Z&publisher_name=PubOne&buyer_name=BuyerOne"
        )
      )
    );

    expect(parseRingbaPixelRequest).toHaveBeenCalledTimes(1);
    const parsedUrl = parseRingbaPixelRequest.mock.calls[0]?.[0] as URL;
    expect(parsedUrl.searchParams.get("api_key")).toBe("ringba_live_key");
    expect(parsedUrl.searchParams.get("platform")).toBe("ringba");
    expect(parsedUrl.searchParams.get("call_id")).toBe("call_123");
    expect(parsedUrl.searchParams.get("caller_number")).toBe("+15555550123");
    expect(parsedUrl.searchParams.get("duration_seconds")).toBe("61");
    expect(parsedUrl.searchParams.get("recording_url")).toBe("https://example.com/recording.mp3");
    expect(parsedUrl.searchParams.get("campaign_name")).toBe("Alpha");
    expect(parsedUrl.searchParams.get("call_timestamp")).toBe("2026-04-11T00:00:00.000Z");
    expect(parsedUrl.searchParams.get("publisher_name")).toBe("PubOne");
    expect(parsedUrl.searchParams.get("buyer_name")).toBe("BuyerOne");
  });
});
