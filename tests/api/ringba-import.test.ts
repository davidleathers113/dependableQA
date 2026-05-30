import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, getAdminSupabase, loadIntegrationContext, runRingbaManualImport } =
  vi.hoisted(() => ({
    requireApiSession: vi.fn(),
    getAdminSupabase: vi.fn(),
    loadIntegrationContext: vi.fn(),
    runRingbaManualImport: vi.fn(),
  }));

vi.mock("../../src/lib/auth/request-session", () => ({ requireApiSession }));
vi.mock("../../src/lib/supabase/admin-client", () => ({ getAdminSupabase }));
vi.mock("../../src/server/integration-ingest", () => ({ loadIntegrationContext }));
vi.mock("../../src/server/ringba-import", async () => {
  const actual = await vi.importActual<typeof import("../../src/server/ringba-import")>(
    "../../src/server/ringba-import"
  );
  return { ...actual, runRingbaManualImport };
});

import { POST } from "../../src/pages/api/integrations/ringba/import";

function ctx(body: unknown): APIContext {
  return {
    request: new Request("http://localhost/api/integrations/ringba/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  } as APIContext;
}

const validBody = {
  integrationId: "int_1",
  dateStartIso: "2026-05-01T00:00:00.000Z",
  dateEndIso: "2026-05-07T00:00:00.000Z",
  maxRecords: 50,
};

beforeEach(() => {
  requireApiSession.mockReset();
  getAdminSupabase.mockReset();
  loadIntegrationContext.mockReset();
  runRingbaManualImport.mockReset();
  getAdminSupabase.mockReturnValue({ name: "admin" });
});

describe("POST /api/integrations/ringba/import", () => {
  it("returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await POST(ctx(validBody));
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admins", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "reviewer" },
    });
    const response = await POST(ctx(validBody));
    expect(response.status).toBe(403);
  });

  it("returns 400 when maxRecords is invalid", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    const response = await POST(ctx({ ...validBody, maxRecords: 0 }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the integration belongs to another org", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    loadIntegrationContext.mockResolvedValue({
      id: "int_1",
      organizationId: "org_OTHER",
      provider: "ringba",
      displayName: "Ringba",
      config: {},
    });
    const response = await POST(ctx(validBody));
    expect(response.status).toBe(404);
    expect(runRingbaManualImport).not.toHaveBeenCalled();
  });

  it("runs the import for the authenticated org", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    loadIntegrationContext.mockResolvedValue({
      id: "int_1",
      organizationId: "org_1",
      provider: "ringba",
      displayName: "Ringba",
      config: {},
    });
    runRingbaManualImport.mockResolvedValue({
      batchId: "batch_1",
      status: "completed",
      recordsSeen: 10,
      recordsImported: 8,
      recordingsImported: 8,
      rejectedCount: 0,
      callIds: ["c1"],
      importedCalls: [],
      capped: false,
    });

    const response = await POST(ctx(validBody));
    expect(response.status).toBe(200);
    expect(runRingbaManualImport).toHaveBeenCalledWith(
      { name: "admin" },
      expect.objectContaining({ organizationId: "org_1" }),
      expect.objectContaining({ requestedBy: "user_1", maxRecords: 50 })
    );
  });
});
