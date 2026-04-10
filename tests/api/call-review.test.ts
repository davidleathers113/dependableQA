import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiSession,
  createServerSupabaseClient,
  getAdminSupabase,
  insertAuditLog,
} = vi.hoisted(() => ({
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

import { POST } from "../../src/pages/api/calls/[callId]/review";

function createApiContext(context: Partial<APIContext>): APIContext {
  return context as APIContext;
}

function createCallLookupClient(result: { data: Record<string, unknown> | null; error: { message: string } | null }) {
  const eq = vi.fn();
  const single = vi.fn().mockResolvedValue(result);
  const query = {
    select: vi.fn(() => query),
    eq,
    single,
  };

  eq.mockImplementation(() => query);

  return {
    client: {
      from: vi.fn(() => query),
    },
    eq,
  };
}

describe("POST /api/calls/[callId]/review", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    createServerSupabaseClient.mockReset();
    getAdminSupabase.mockReset();
    insertAuditLog.mockReset();
  });

  it("returns 401 when the user is not authenticated", async () => {
    requireApiSession.mockResolvedValue(null);

    const response = await POST(createApiContext({
      params: { callId: "call_1" },
      request: new Request("http://localhost/api/calls/call_1/review", { method: "POST" }),
    }));

    expect(response.status).toBe(401);
  });

  it("returns 400 when callId is missing", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });

    const response = await POST(createApiContext({
      params: {},
      request: new Request("http://localhost/api/calls/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review-status", reviewStatus: "reviewed" }),
      }),
      cookies: {} as any,
    }));

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid bodies before touching the database", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });

    const response = await POST(createApiContext({
      params: { callId: "call_1" },
      request: new Request("http://localhost/api/calls/call_1/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      cookies: {} as any,
    }));

    expect(response.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("scopes the call lookup to the authenticated organization", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    getAdminSupabase.mockReturnValue({});

    const { client, eq } = createCallLookupClient({
      data: null,
      error: null,
    });
    createServerSupabaseClient.mockReturnValue(client);

    const response = await POST(createApiContext({
      params: { callId: "call_1" },
      request: new Request("http://localhost/api/calls/call_1/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review-status", reviewStatus: "reviewed" }),
      }),
      cookies: {} as any,
    }));

    expect(response.status).toBe(404);
    expect(eq).toHaveBeenCalledWith("organization_id", "org_1");
    expect(eq).toHaveBeenCalledWith("id", "call_1");
  });
});
