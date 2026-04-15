import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getIntegrationsSummary,
  insertAuditLog,
  requireApiSession,
  getAdminSupabase,
  sendIntegrationTestEvent,
  supportedIntegrationCatalog,
} = vi.hoisted(() => ({
  getIntegrationsSummary: vi.fn(),
  insertAuditLog: vi.fn(),
  requireApiSession: vi.fn(),
  getAdminSupabase: vi.fn(),
  sendIntegrationTestEvent: vi.fn(),
  supportedIntegrationCatalog: [
    {
      provider: "ringba",
      fallbackId: "catalog:ringba",
      defaultDisplayName: "Ringba Primary",
      defaultMode: "webhook",
    },
    {
      provider: "trackdrive",
      fallbackId: "catalog:trackdrive",
      defaultDisplayName: "TrackDrive",
      defaultMode: "webhook",
    },
    {
      provider: "retreaver",
      fallbackId: "catalog:retreaver",
      defaultDisplayName: "Retreaver",
      defaultMode: "webhook",
    },
  ],
}));

vi.mock("../../src/lib/app-data", () => ({
  getIntegrationsSummary,
  insertAuditLog,
  SUPPORTED_INTEGRATION_CATALOG: supportedIntegrationCatalog,
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

function createIntegrationsAdminClient(
  existingConfig: Record<string, unknown> = {},
  options?: {
    existingById?: boolean;
    existingByProvider?: boolean;
    insertedId?: string;
    insertedDisplayName?: string;
  }
) {
  let updatedValues: Record<string, unknown> | null = null;
  let insertedValues: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};

  const selectQuery = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      if (filters.id) {
        if (options?.existingById === false) {
          return { data: null, error: null };
        }

        return {
          data: {
            id: "integration_1",
            organization_id: "org_1",
            provider: "ringba",
            display_name: "Primary Integration",
            config: existingConfig,
          },
          error: null,
        };
      }

      if (filters.provider) {
        if (options?.existingByProvider === false) {
          return { data: null, error: null };
        }

        return {
          data: {
            id: "integration_1",
            organization_id: "org_1",
            provider: "ringba",
            display_name: options?.insertedDisplayName ?? "Primary Integration",
            config: existingConfig,
          },
          error: null,
        };
      }

      return {
        data: {
          id: "integration_1",
          organization_id: "org_1",
          provider: "ringba",
          display_name: "Primary Integration",
          config: existingConfig,
        },
        error: null,
      };
    }),
  };
  selectQuery.eq.mockImplementation((column: string, value: unknown) => {
    filters[column] = value;
    return selectQuery;
  });

  const updateQuery = {
    error: null as { message: string } | null,
    eq: vi.fn(),
  };
  updateQuery.eq.mockImplementation(() => updateQuery);

  const insertQuery = {
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: {
          id: options?.insertedId ?? "integration_2",
          display_name: options?.insertedDisplayName ?? "TrackDrive",
        },
        error: null,
      }),
    })),
  };

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => selectQuery),
      update: vi.fn((values: Record<string, unknown>) => {
        updatedValues = values;
        return updateQuery;
      }),
      insert: vi.fn((values: Record<string, unknown>) => {
        insertedValues = values;
        return insertQuery;
      }),
    })),
  };

  return {
    client,
    getUpdatedValues() {
      return updatedValues;
    },
    getInsertedValues() {
      return insertedValues;
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
          isConfigured: true,
          isCatalogPlaceholder: false,
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
          ringba: {
            publicIngestKey: "ringba_live_key",
            minimumDurationSeconds: 30,
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
        isConfigured: true,
        isCatalogPlaceholder: false,
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
        ringba: {
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        },
        recentEvents: [],
      },
    });
  });

  it("creates a missing provider integration and returns refreshed summary data", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    const { client, getInsertedValues } = createIntegrationsAdminClient(
      {},
      {
        existingByProvider: false,
        insertedId: "integration_2",
        insertedDisplayName: "TrackDrive",
      }
    );
    getAdminSupabase.mockReturnValue(client);
    getIntegrationsSummary.mockResolvedValue({
      integrations: [
        {
          id: "catalog:ringba",
          isConfigured: false,
          isCatalogPlaceholder: true,
          displayName: "Ringba Primary",
          provider: "ringba",
          status: "disconnected",
          mode: "webhook",
          lastSuccessAt: null,
          lastErrorAt: null,
          lastEventMessage: null,
          lastEventSeverity: null,
          webhookAuth: {
            authType: "hmac-sha256",
            headerName: "x-dependableqa-signature",
            prefix: "sha256=",
            secretConfigured: false,
            secretSource: "none",
          },
          ringba: {
            publicIngestKey: "",
            minimumDurationSeconds: 30,
          },
          recentEvents: [],
        },
        {
          id: "integration_2",
          isConfigured: true,
          isCatalogPlaceholder: false,
          displayName: "TrackDrive",
          provider: "trackdrive",
          status: "disconnected",
          mode: "webhook",
          lastSuccessAt: null,
          lastErrorAt: null,
          lastEventMessage: null,
          lastEventSeverity: null,
          webhookAuth: {
            authType: "hmac-sha256",
            headerName: "x-dependableqa-signature",
            prefix: "sha256=",
            secretConfigured: false,
            secretSource: "none",
          },
          ringba: {
            publicIngestKey: "",
            minimumDurationSeconds: 30,
          },
          recentEvents: [],
        },
        {
          id: "catalog:retreaver",
          isConfigured: false,
          isCatalogPlaceholder: true,
          displayName: "Retreaver",
          provider: "retreaver",
          status: "disconnected",
          mode: "webhook",
          lastSuccessAt: null,
          lastErrorAt: null,
          lastEventMessage: null,
          lastEventSeverity: null,
          webhookAuth: {
            authType: "hmac-sha256",
            headerName: "x-dependableqa-signature",
            prefix: "sha256=",
            secretConfigured: false,
            secretSource: "none",
          },
          ringba: {
            publicIngestKey: "",
            minimumDurationSeconds: 30,
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
          action: "create-integration",
          provider: "trackdrive",
          displayName: "TrackDrive",
        }),
      }),
    }));

    expect(response.status).toBe(200);
    expect(getInsertedValues()).toEqual(expect.objectContaining({
      organization_id: "org_1",
      provider: "trackdrive",
      display_name: "TrackDrive",
      mode: "webhook",
      status: "disconnected",
    }));
    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: "TrackDrive created.",
      integration: {
        id: "integration_2",
        isConfigured: true,
        isCatalogPlaceholder: false,
        displayName: "TrackDrive",
        provider: "trackdrive",
        status: "disconnected",
        mode: "webhook",
        lastSuccessAt: null,
        lastErrorAt: null,
        lastEventMessage: null,
        lastEventSeverity: null,
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: false,
          secretSource: "none",
        },
        ringba: {
          publicIngestKey: "",
          minimumDurationSeconds: 30,
        },
        recentEvents: [],
      },
    });
  });

  it("creates Ringba integrations with a dedicated public ingest key", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    const { client, getInsertedValues } = createIntegrationsAdminClient(
      {},
      {
        existingByProvider: false,
        insertedId: "integration_ringba",
        insertedDisplayName: "Ringba Primary",
      }
    );
    getAdminSupabase.mockReturnValue(client);
    getIntegrationsSummary.mockResolvedValue({
      integrations: [
        {
          id: "integration_ringba",
          isConfigured: true,
          isCatalogPlaceholder: false,
          displayName: "Ringba Primary",
          provider: "ringba",
          status: "disconnected",
          mode: "webhook",
          lastSuccessAt: null,
          lastErrorAt: null,
          lastEventMessage: null,
          lastEventSeverity: null,
          webhookAuth: {
            authType: "hmac-sha256",
            headerName: "x-dependableqa-signature",
            prefix: "sha256=",
            secretConfigured: false,
            secretSource: "none",
          },
          ringba: {
            publicIngestKey: "ringba_live_key",
            minimumDurationSeconds: 30,
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
          action: "create-integration",
          provider: "ringba",
          displayName: "Ringba Primary",
        }),
      }),
    }));

    const insertedValues = getInsertedValues();
    expect(insertedValues).toEqual(expect.objectContaining({
      organization_id: "org_1",
      provider: "ringba",
      display_name: "Ringba Primary",
      mode: "webhook",
      status: "disconnected",
    }));
    expect(insertedValues?.config).toEqual(expect.objectContaining({
      webhookAuth: {
        type: "hmac-sha256",
        headerName: "x-dependableqa-signature",
        prefix: "sha256=",
      },
      ringba: expect.objectContaining({
        minimumDurationSeconds: 30,
      }),
    }));
    expect(
      typeof (insertedValues?.config as { ringba?: { publicIngestKey?: unknown } }).ringba?.publicIngestKey
    ).toBe("string");
    expect(
      ((insertedValues?.config as { ringba?: { publicIngestKey?: string } }).ringba?.publicIngestKey ?? "").startsWith(
        "ringba_live_"
      )
    ).toBe(true);

    expect(response.status).toBe(200);
  });

  it("returns 400 when update-ringba-api receives an invalid IANA time zone", async () => {
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
          action: "update-ringba-api",
          integrationId: "integration_1",
          callLogsTimeZone: "Not/AZone",
          ringbaAccountId: "RA_test",
        }),
      }),
    }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain("IANA");
  });
});
