import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiSession, getAdminSupabase, enqueueAnalysisForCalls } = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getAdminSupabase: vi.fn(),
  enqueueAnalysisForCalls: vi.fn(),
}));

vi.mock("../../src/lib/auth/request-session", () => ({ requireApiSession }));
vi.mock("../../src/lib/supabase/admin-client", () => ({ getAdminSupabase }));
vi.mock("../../src/server/analyze-selection", async () => {
  const actual = await vi.importActual<typeof import("../../src/server/analyze-selection")>(
    "../../src/server/analyze-selection"
  );
  return { ...actual, enqueueAnalysisForCalls };
});

import { POST } from "../../src/pages/api/calls/analyze-selected";
import { InsufficientBalanceError } from "../../src/server/analyze-selection";

function ctx(body: unknown): APIContext {
  return {
    request: new Request("http://localhost/api/calls/analyze-selected", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  } as APIContext;
}

beforeEach(() => {
  requireApiSession.mockReset();
  getAdminSupabase.mockReset();
  enqueueAnalysisForCalls.mockReset();
  getAdminSupabase.mockReturnValue({ name: "admin" });
});

describe("POST /api/calls/analyze-selected", () => {
  it("returns 401 when unauthenticated", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await POST(ctx({ callIds: ["c1"] }));
    expect(response.status).toBe(401);
  });

  it.each(["owner", "admin", "billing", "reviewer", "analyst"])(
    "allows the %s role to queue analysis",
    async (role) => {
      requireApiSession.mockResolvedValue({
        user: { id: "user_1" },
        organization: { id: "org_1", role },
      });
      enqueueAnalysisForCalls.mockResolvedValue({
        requested: 1,
        transcriptionQueued: 1,
        analysisQueued: 0,
        skipped: [],
      });
      const response = await POST(ctx({ callIds: ["c1"] }));
      expect(response.status).toBe(200);
      expect(enqueueAnalysisForCalls).toHaveBeenCalled();
    }
  );

  it("returns 403 for a role outside the AI-spend allowlist", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "viewer" },
    });
    const response = await POST(ctx({ callIds: ["c1"] }));
    expect(response.status).toBe(403);
    expect(enqueueAnalysisForCalls).not.toHaveBeenCalled();
  });

  it("returns 400 when callIds is empty", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    const response = await POST(ctx({ callIds: [] }));
    expect(response.status).toBe(400);
    expect(enqueueAnalysisForCalls).not.toHaveBeenCalled();
  });

  it("queues analysis scoped to the authenticated org", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "reviewer" },
    });
    enqueueAnalysisForCalls.mockResolvedValue({
      requested: 2,
      transcriptionQueued: 2,
      analysisQueued: 0,
      skipped: [],
    });

    const response = await POST(ctx({ callIds: ["c1", "c2"], importBatchId: "batch_1" }));
    expect(response.status).toBe(200);
    expect(enqueueAnalysisForCalls).toHaveBeenCalledWith(
      { name: "admin" },
      expect.objectContaining({
        organizationId: "org_1",
        callIds: ["c1", "c2"],
        importBatchId: "batch_1",
        actorUserId: "user_1",
      })
    );
  });

  it("returns 402 when the wallet balance is insufficient", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    enqueueAnalysisForCalls.mockRejectedValue(new InsufficientBalanceError(100, 50));

    const response = await POST(ctx({ callIds: ["c1"] }));
    expect(response.status).toBe(402);
    const body = (await response.json()) as { error?: string; requiredCents?: number; availableCents?: number };
    expect(body.requiredCents).toBe(100);
    expect(body.availableCents).toBe(50);
  });

  it("surfaces a 400 when the gate rejects (e.g. cap exceeded)", async () => {
    requireApiSession.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", role: "owner" },
    });
    enqueueAnalysisForCalls.mockRejectedValue(new Error("Too many calls selected. The maximum per request is 2000."));

    const response = await POST(ctx({ callIds: ["c1"] }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain("Too many calls selected");
  });
});
