import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getIntegrationsSummary,
  insertAuditLog,
  requireApiSession,
  getAdminSupabase,
  sendIntegrationTestEvent,
} = vi.hoisted(() => ({
  getIntegrationsSummary: vi.fn(),
  insertAuditLog: vi.fn(),
  requireApiSession: vi.fn(),
  getAdminSupabase: vi.fn(),
  sendIntegrationTestEvent: vi.fn(),
}));

vi.mock("../../src/lib/app-data", () => ({
  getIntegrationsSummary,
  insertAuditLog,
}));

vi.mock("../../src/lib/auth/request-session", () => ({
  requireApiSession,
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/server/integration-test-event", () => ({
  sendIntegrationTestEvent,
}));

import { GET, POST } from "../../src/pages/api/settings/integrations";

function createApiContext(context: Partial<APIContext>): APIContext {
  return context as APIContext;
}

function createIntegrationsAdminClient(existingConfig: Record<string, unknown> = {}) {
  let updatedValues: Record<string, unknown> | null = null;

  const selectQuery = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "integration_1",
        display_name: "Primary Integration",
        config: existingConfig,
      },
      error: null,
    }),
  };
  selectQuery.eq.mockImplementation(() => selectQuery);

  const updateQuery = {
    error: null as { message: string } | null,
    eq: vi.fn(),
  };
  updateQuery.eq.mockImplementation(() => updateQuery);

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => selectQuery),
      update: vi.fn((values: Record<string, unknown>) => {
        updatedValues = values;
        return updateQuery;
      }),
    })),
  };

  return {
    client,
    getUpdatedValues() {
      return updatedValues;
    },
  };
}

describe("/api/settings/integrations", () => {
  beforeEach(() => {
    getIntegrationsSummary.mockReset();
    insertAuditLog.mockReset();
    requireApiSession.mockReset();
    getAdminSupabase.mockReset();
    sendIntegrationTestEvent.mockReset();
  });

  it("returns 401 for unauthenticated GET requests", async () => {
    requireApiSession.mockResolvedValue(null);

    const response = await GET(createApiContext({
      request: new Request("http://localhost/api/settings/integrations"),
    }));

    expect(response.status).toBe(401);
  });

  it("returns safe integration summary data for authenticated GET requests", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    getAdminSupabase.mockReturnValue({ name: "admin" });
    getIntegrationsSummary.mockResolvedValue({
      integrations: [{ id: "integration_1", displayName: "Primary" }],
    });

    const response = await GET(createApiContext({
      request: new Request("http://localhost/api/settings/integrations"),
    }));

    expect(response.status).toBe(200);
    expect(getIntegrationsSummary).toHaveBeenCalled();
  });

  it("returns 403 when a non-admin tries to update integration settings", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "reviewer" },
    });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update-webhook-auth",
          integrationId: "integration_1",
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
        }),
      }),
    }));

    expect(response.status).toBe(403);
  });

  it("returns 400 when the header name contains spaces", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    const { client } = createIntegrationsAdminClient();
    getAdminSupabase.mockReturnValue(client);

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update-webhook-auth",
          integrationId: "integration_1",
          authType: "hmac-sha256",
          headerName: "x invalid",
          prefix: "sha256=",
        }),
      }),
    }));

    expect(response.status).toBe(400);
    expect(getAdminSupabase).toHaveBeenCalled();
  });

  it("updates the canonical webhook auth config and writes an audit log", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "admin" },
    });
    const { client, getUpdatedValues } = createIntegrationsAdminClient({
      endpoint: "/.netlify/functions/integration-ingest",
      webhookAuth: {
        type: "hmac-sha256",
        headerName: "x-old-signature",
        prefix: "sha256=",
        secret: "old-secret",
      },
    });
    getAdminSupabase.mockReturnValue(client);
    getIntegrationsSummary.mockResolvedValue({
      integrations: [
        {
          id: "integration_1",
          displayName: "Primary Integration",
        },
      ],
    });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update-webhook-auth",
          integrationId: "integration_1",
          authType: "shared-secret",
          headerName: "x-shared-secret",
          prefix: "",
          secret: "new-secret",
        }),
      }),
    }));

    expect(response.status).toBe(200);
    expect(getUpdatedValues()).toEqual({
      config: {
        endpoint: "/.netlify/functions/integration-ingest",
        webhookAuth: {
          type: "shared-secret",
          headerName: "x-shared-secret",
          prefix: "",
          secret: "new-secret",
        },
      },
    });
    expect(insertAuditLog).toHaveBeenCalledWith(client, expect.objectContaining({
      action: "integration.config.updated",
      entityId: "integration_1",
    }));
  });

  it("returns 403 when a non-admin tries to send a test event", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "reviewer" },
    });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send-test-event",
          integrationId: "integration_1",
        }),
      }),
    }));

    expect(response.status).toBe(403);
  });

  it("returns refreshed integration data after a successful test event", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    const { client } = createIntegrationsAdminClient();
    getAdminSupabase.mockReturnValue(client);
    sendIntegrationTestEvent.mockResolvedValue({
      ok: true,
      message: "Test event accepted.",
    });
    getIntegrationsSummary.mockResolvedValue({
      integrations: [
        {
          id: "integration_1",
          displayName: "Primary Integration",
          provider: "ringba",
          status: "connected",
          mode: "live",
          lastSuccessAt: "2026-04-10T00:00:00.000Z",
          lastErrorAt: null,
          lastEventMessage: "Test event accepted.",
          lastEventSeverity: "info",
          webhookAuth: {
            authType: "hmac-sha256",
            headerName: "x-dependableqa-signature",
            prefix: "sha256=",
            secretConfigured: true,
            secretSource: "integration",
          },
          recentEvents: [],
        },
      ],
    });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send-test-event",
          integrationId: "integration_1",
        }),
      }),
    }));

    expect(response.status).toBe(200);
    expect(sendIntegrationTestEvent).toHaveBeenCalledWith(client, "integration_1");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: "Test event accepted.",
      integration: {
        id: "integration_1",
        displayName: "Primary Integration",
        provider: "ringba",
        status: "connected",
        mode: "live",
        lastSuccessAt: "2026-04-10T00:00:00.000Z",
        lastErrorAt: null,
        lastEventMessage: "Test event accepted.",
        lastEventSeverity: "info",
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: true,
          secretSource: "integration",
        },
        recentEvents: [],
      },
    });
  });
});
