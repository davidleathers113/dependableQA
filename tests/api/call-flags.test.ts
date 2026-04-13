import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, createServerSupabaseClient, getAdminSupabase, insertAuditLog } = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getAdminSupabase: vi.fn(),
  insertAuditLog: vi.fn(),
}));

vi.mock("../../src/lib/auth/request-session", () => ({
  requireApiSession,
}));

vi.mock("../../src/lib/supabase/server-client", () => ({
  createServerSupabaseClient,
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/lib/app-data", () => ({
  insertAuditLog,
}));

import { PATCH, POST } from "../../src/pages/api/calls/[callId]/flags";

function createApiContext(partial: Partial<APIContext>): APIContext {
  return partial as APIContext;
}

describe("POST /api/calls/[callId]/flags", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    createServerSupabaseClient.mockReset();
    getAdminSupabase.mockReset();
    insertAuditLog.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await POST(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/flags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            flagCategory: "compliance",
            severity: "high",
            title: "Issue",
          }),
        }),
        cookies: {} as any,
      })
    );
    expect(response.status).toBe(401);
  });

  it("scopes call lookup to organization", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
      organization: { id: "org1", name: "O", role: "owner" },
    });
    getAdminSupabase.mockReturnValue({});

    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const builder: { eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> } = {
      eq: vi.fn(),
      single,
    };
    builder.eq.mockReturnValue(builder);
    const query = {
      select: vi.fn().mockReturnValue(builder),
    };
    createServerSupabaseClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });

    const response = await POST(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/flags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            flagCategory: "compliance",
            severity: "high",
            title: "Issue",
          }),
        }),
        cookies: {} as any,
      })
    );

    expect(response.status).toBe(404);
    expect(builder.eq).toHaveBeenCalledWith("organization_id", "org1");
    expect(builder.eq).toHaveBeenCalledWith("id", "c1");
  });
});

describe("PATCH /api/calls/[callId]/flags", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    createServerSupabaseClient.mockReset();
    getAdminSupabase.mockReset();
    insertAuditLog.mockReset();
  });

  it("rejects editing AI flags", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
      organization: { id: "org1", name: "O", role: "owner" },
    });
    getAdminSupabase.mockReturnValue({});

    const single = vi.fn().mockResolvedValue({
      data: {
        id: "f1",
        source: "ai",
        title: "t",
        description: null,
        flag_category: "compliance",
        severity: "low",
        start_seconds: null,
        end_seconds: null,
        status: "open",
      },
      error: null,
    });
    const builder: { eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> } = {
      eq: vi.fn(),
      single,
    };
    builder.eq.mockReturnValue(builder);
    const query = {
      select: vi.fn().mockReturnValue(builder),
    };
    createServerSupabaseClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });

    const response = await PATCH(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/flags", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flagId: "f1", title: "x" }),
        }),
        cookies: {} as any,
      })
    );

    expect(response.status).toBe(403);
  });
});
