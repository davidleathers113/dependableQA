import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminSupabase, runAiJobs } = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(),
  runAiJobs: vi.fn(),
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/server/ai-jobs", () => ({
  runAiJobs,
}));

import { handler } from "../../netlify/functions/ai-dispatch";

describe("ai-dispatch handler", () => {
  beforeEach(() => {
    getAdminSupabase.mockReset();
    runAiJobs.mockReset();
    process.env.AI_DISPATCH_SHARED_SECRET = "dispatch-secret";
  });

  it("rejects requests without the shared secret header", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
      headers: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns processed and recovered counts for authorized requests", async () => {
    getAdminSupabase.mockReturnValue({ name: "admin" });
    runAiJobs.mockResolvedValue({
      processed: [{ id: "job_1", organizationId: "org_1", callId: "call_1", jobType: "analysis", status: "completed" }],
      recovered: [{ id: "job_2", organizationId: "org_1", callId: "call_2", jobType: "transcription", status: "retry_scheduled" }],
    });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ limit: 10, jobType: "analysis" }),
      headers: {
        "x-dependableqa-ai-dispatch": "dispatch-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(runAiJobs).toHaveBeenCalledWith(
      { name: "admin" },
      {
        limit: 10,
        jobType: "analysis",
      }
    );
    expect(JSON.parse(response.body)).toEqual({
      processedCount: 1,
      recoveredCount: 1,
      processed: [{ id: "job_1", organizationId: "org_1", callId: "call_1", jobType: "analysis", status: "completed" }],
      recovered: [{ id: "job_2", organizationId: "org_1", callId: "call_2", jobType: "transcription", status: "retry_scheduled" }],
    });
  });
});
