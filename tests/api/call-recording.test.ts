import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, createServerSupabaseClient, getAdminSupabase, fetchRecordingWithGuards } =
  vi.hoisted(() => ({
    requireApiSession: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    getAdminSupabase: vi.fn(),
    fetchRecordingWithGuards: vi.fn(),
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

vi.mock("../../src/server/recording-fetch", () => ({
  fetchRecordingWithGuards,
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
    fetchRecordingWithGuards.mockReset();
  });

  const session = {
    user: { id: "u1", email: "a@b.c" },
    organization: { id: "org1", name: "O", role: "owner" },
  };

  // Admin mock that records which tables/buckets are touched, so we can assert
  // playback materialization never enqueues AI jobs.
  function mockAdmin({ uploadError = null, updateError = null, signedUrl = "https://example.com/signed" } = {}) {
    const fromCalls: string[] = [];
    const bucketCalls: string[] = [];
    const upload = vi.fn().mockResolvedValue({ error: uploadError });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: signedUrl ? { signedUrl } : null,
      error: signedUrl ? null : { message: "sign failed" },
    });
    const updateEq2 = vi.fn().mockResolvedValue({ error: updateError });
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
    const update = vi.fn().mockReturnValue({ eq: updateEq1 });
    const admin = {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
        return { update };
      }),
      storage: {
        from: vi.fn((bucket: string) => {
          bucketCalls.push(bucket);
          return { upload, createSignedUrl };
        }),
      },
    };
    return { admin, fromCalls, bucketCalls, upload, createSignedUrl, update };
  }

  function ctx() {
    return createApiContext({
      params: { callId: "c1" },
      request: new Request("http://localhost/api/calls/c1/recording"),
      cookies: {} as any,
    });
  }

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

  it("materializes a URL-only recording, then returns a signed URL without enqueuing AI", async () => {
    requireApiSession.mockResolvedValue(session);
    createServerSupabaseClient.mockReturnValue(
      mockCallClient(
        { id: "c1", recording_storage_path: "", recording_url: "https://media.ringba.com/r" },
        null
      )
    );
    fetchRecordingWithGuards.mockResolvedValue({
      bytes: Buffer.from("ID3 audio"),
      contentType: "audio/mpeg",
      extension: ".mp3",
      finalUrl: "https://ringba-recordings.s3.amazonaws.com/x.mp3",
    });
    const { admin, fromCalls, upload, createSignedUrl } = mockAdmin();
    getAdminSupabase.mockReturnValue(admin);

    const response = await GET(ctx());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toBe("https://example.com/signed");
    expect(fetchRecordingWithGuards).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(
      "org1/c1.mp3",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "audio/mpeg", upsert: true })
    );
    expect(createSignedUrl).toHaveBeenCalledWith("org1/c1.mp3", 3600);
    // Playback must never enqueue AI work.
    expect(fromCalls).toEqual(["calls"]);
    expect(fromCalls).not.toContain("ai_jobs");
  });

  it("returns a clear error when a URL-only recording cannot be fetched", async () => {
    requireApiSession.mockResolvedValue(session);
    createServerSupabaseClient.mockReturnValue(
      mockCallClient(
        { id: "c1", recording_storage_path: "", recording_url: "https://media.ringba.com/dead" },
        null
      )
    );
    fetchRecordingWithGuards.mockRejectedValue(new Error("Unable to fetch recording. Upstream returned 410."));
    const { admin, createSignedUrl } = mockAdmin();
    getAdminSupabase.mockReturnValue(admin);

    const response = await GET(ctx());

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Recording source unavailable or expired.");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("denies cross-org access (org-scoped query returns nothing)", async () => {
    requireApiSession.mockResolvedValue(session);
    createServerSupabaseClient.mockReturnValue(mockCallClient(null, { message: "no rows" }));

    const response = await GET(ctx());

    expect(response.status).toBe(404);
    expect(getAdminSupabase).not.toHaveBeenCalled();
  });
});
