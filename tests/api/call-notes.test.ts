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

import { DELETE, GET, POST } from "../../src/pages/api/calls/[callId]/notes";

function createApiContext(partial: Partial<APIContext>): APIContext {
  return partial as APIContext;
}

function chainSelectSingle(data: unknown, error: unknown) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const builder: { eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> } = {
    eq: vi.fn(),
    single,
  };
  builder.eq.mockReturnValue(builder);
  return {
    select: vi.fn().mockReturnValue(builder),
  };
}

describe("call review notes API", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    createServerSupabaseClient.mockReset();
    getAdminSupabase.mockReset();
    insertAuditLog.mockReset();
  });

  it("GET returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await GET(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/notes"),
        cookies: {} as any,
      })
    );
    expect(response.status).toBe(401);
  });

  it("GET returns notes array when call exists", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
      organization: { id: "org1", name: "O", role: "owner" },
    });
    getAdminSupabase.mockReturnValue({});

    const callChain = chainSelectSingle({ id: "c1" }, null);
    const notesChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "n1",
                  body: "hello",
                  start_seconds: 1.5,
                  end_seconds: null,
                  created_at: "2026-01-01T00:00:00.000Z",
                  created_by: "u1",
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    createServerSupabaseClient.mockImplementation((() => {
      return {
        from: vi.fn((table: string) => {
          if (table === "calls") {
            return callChain;
          }
          if (table === "call_review_notes") {
            return notesChain;
          }
          return callChain;
        }),
      };
    }) as any);

    const response = await GET(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/notes"),
        cookies: {} as any,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { notes: Array<{ id: string; body: string }> };
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].body).toBe("hello");
  });

  it("POST returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await POST(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: "x", startSeconds: 0 }),
        }),
        cookies: {} as any,
      })
    );
    expect(response.status).toBe(401);
  });

  it("DELETE returns 400 without noteId", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
      organization: { id: "org1", name: "O", role: "owner" },
    });
    const response = await DELETE(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/notes"),
        cookies: {} as any,
      })
    );
    expect(response.status).toBe(400);
  });
});
