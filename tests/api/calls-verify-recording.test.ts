import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, getAdminSupabase, verifyRecordings } = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getAdminSupabase: vi.fn(),
  verifyRecordings: vi.fn(),
}));

vi.mock("../../src/lib/auth/request-session", () => ({ requireApiSession }));
vi.mock("../../src/lib/supabase/admin-client", () => ({ getAdminSupabase }));
vi.mock("../../src/server/recording-preflight", async () => {
  const actual = await vi.importActual<typeof import("../../src/server/recording-preflight")>(
    "../../src/server/recording-preflight"
  );
  return { ...actual, verifyRecordings };
});

import { POST } from "../../src/pages/api/calls/verify-recording";

function ctx(body: unknown): APIContext {
  return {
    request: new Request("http://localhost/api/calls/verify-recording", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  } as APIContext;
}

beforeEach(() => {
  requireApiSession.mockReset();
  getAdminSupabase.mockReset();
  verifyRecordings.mockReset();
  getAdminSupabase.mockReturnValue({ name: "admin" });
});

describe("POST /api/calls/verify-recording", () => {
  it("returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await POST(ctx({ callIds: ["c1"] }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for a role outside the AI-spend allowlist", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1" },
      organization: { id: "org1", role: "viewer" },
    });
    const response = await POST(ctx({ callIds: ["c1"] }));
    expect(response.status).toBe(403);
    expect(verifyRecordings).not.toHaveBeenCalled();
  });

  it("returns 400 when callIds is empty", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1" },
      organization: { id: "org1", role: "reviewer" },
    });
    const response = await POST(ctx({ callIds: [] }));
    expect(response.status).toBe(400);
    expect(verifyRecordings).not.toHaveBeenCalled();
  });

  it("returns 400 when the batch exceeds the cap", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1" },
      organization: { id: "org1", role: "owner" },
    });
    const tooMany = Array.from({ length: 201 }, (_, i) => `c${i}`);
    const response = await POST(ctx({ callIds: tooMany }));
    expect(response.status).toBe(400);
    expect(verifyRecordings).not.toHaveBeenCalled();
  });

  it("returns readiness results scoped to the authenticated org", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "u1" },
      organization: { id: "org1", role: "reviewer" },
    });
    verifyRecordings.mockResolvedValue([
      { callId: "c1", status: "ready" },
      { callId: "c2", status: "too_large" },
    ]);

    const response = await POST(ctx({ callIds: ["c1", "c2"] }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; results: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(verifyRecordings).toHaveBeenCalledWith(
      { name: "admin" },
      expect.objectContaining({ organizationId: "org1", callIds: ["c1", "c2"] })
    );
  });
});
