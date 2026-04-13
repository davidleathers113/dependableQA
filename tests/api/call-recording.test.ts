import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, createServerSupabaseClient, getAdminSupabase } = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getAdminSupabase: vi.fn(),
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

import { GET } from "../../src/pages/api/calls/[callId]/recording";

function createApiContext(partial: Partial<APIContext>): APIContext {
  return partial as APIContext;
}

function mockCallClient(data: Record<string, unknown> | null, error: { message: string } | null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ single });
  const query = {
    select: vi.fn().mockReturnValue({ eq }),
    eq,
    single,
  };
  eq.mockImplementation(() => ({ eq, single }));
  return {
    from: vi.fn().mockReturnValue(query),
  };
}

describe("GET /api/calls/[callId]/recording", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    createServerSupabaseClient.mockReset();
    getAdminSupabase.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await GET(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/recording"),
        cookies: {} as any,
      })
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 when call has no storage path", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
      organization: { id: "org1", name: "O", role: "owner" },
    });
    createServerSupabaseClient.mockReturnValue(
      mockCallClient({ id: "c1", recording_storage_path: "" }, null)
    );

    const response = await GET(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/recording"),
        cookies: {} as any,
      })
    );
    expect(response.status).toBe(404);
    expect(getAdminSupabase).not.toHaveBeenCalled();
  });

  it("returns signed URL when storage path exists", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
      organization: { id: "org1", name: "O", role: "owner" },
    });
    createServerSupabaseClient.mockReturnValue(
      mockCallClient({ id: "c1", recording_storage_path: "org1/file.mp3" }, null)
    );

    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });
    getAdminSupabase.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl,
        }),
      },
    });

    const response = await GET(
      createApiContext({
        params: { callId: "c1" },
        request: new Request("http://localhost/api/calls/c1/recording"),
        cookies: {} as any,
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; expiresAt: string };
    expect(body.url).toBe("https://example.com/signed");
    expect(typeof body.expiresAt).toBe("string");
    expect(createSignedUrl).toHaveBeenCalledWith("org1/file.mp3", 3600);
  });
});
