import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, getAdminSupabase, dispatchImportBatch } = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getAdminSupabase: vi.fn(),
  dispatchImportBatch: vi.fn(),
}));

vi.mock("../../src/lib/auth/request-session", () => ({
  requireApiSession,
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/server/import-dispatch", () => ({
  dispatchImportBatch,
}));

import { POST } from "../../src/pages/api/imports/dispatch";

function createApiContext(context: Partial<APIContext>): APIContext {
  return context as APIContext;
}

describe("POST /api/imports/dispatch", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    getAdminSupabase.mockReset();
    dispatchImportBatch.mockReset();
  });

  it("returns 401 when the user is not authenticated", async () => {
    requireApiSession.mockResolvedValue(null);

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/imports/dispatch", { method: "POST" }),
    }));

    expect(response.status).toBe(401);
  });

  it("returns 400 when batchId is missing", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/imports/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/imports/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    }));

    expect(response.status).toBe(400);
  });

  it("dispatches the batch for the authenticated organization", async () => {
    const adminClient = { name: "admin" };
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    });
    getAdminSupabase.mockReturnValue(adminClient);
    dispatchImportBatch.mockResolvedValue({ status: "completed" });

    const response = await POST(createApiContext({
      request: new Request("http://localhost/api/imports/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: "batch_1" }),
      }),
    }));

    expect(response.status).toBe(200);
    expect(dispatchImportBatch).toHaveBeenCalledWith(adminClient, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });
  });
});
