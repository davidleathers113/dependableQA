import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, getAdminSupabase, getAiOperationsSummary } = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getAdminSupabase: vi.fn(),
  getAiOperationsSummary: vi.fn(),
}));

vi.mock("../../src/lib/auth/request-session", () => ({
  requireApiSession,
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/lib/app-data", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/app-data")>("../../src/lib/app-data");
  return {
    ...actual,
    getAiOperationsSummary,
  };
});

import { GET } from "../../src/pages/api/ai/ops";

function createApiContext(context: Partial<APIContext>): APIContext {
  return context as APIContext;
}

describe("GET /api/ai/ops", () => {
  beforeEach(() => {
    requireApiSession.mockReset();
    getAdminSupabase.mockReset();
    getAiOperationsSummary.mockReset();
  });

  it("returns 401 when the user is not authenticated", async () => {
    requireApiSession.mockResolvedValue(null);

    const response = await GET(
      createApiContext({
        request: new Request("http://localhost/api/ai/ops"),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns the AI operations summary for the authenticated organization", async () => {
    requireApiSession.mockResolvedValue({
      organization: { id: "org_1" },
      user: { id: "user_1" },
    });
    getAdminSupabase.mockReturnValue({ name: "admin" });
    getAiOperationsSummary.mockResolvedValue({
      counts: {
        queued: 1,
        retryScheduled: 0,
        claimed: 0,
        running: 1,
        failed: 0,
      },
      staleJobs: 0,
      oldestPendingAt: "2026-04-12T00:00:00.000Z",
      lastCompletedAt: "2026-04-12T00:05:00.000Z",
      recentJobs: [],
    });

    const response = await GET(
      createApiContext({
        request: new Request("http://localhost/api/ai/ops"),
      })
    );

    expect(response.status).toBe(200);
    expect(getAiOperationsSummary).toHaveBeenCalledWith({ name: "admin" }, "org_1");
  });
});
