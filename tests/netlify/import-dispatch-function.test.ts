import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminSupabase, dispatchImportBatch } = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(),
  dispatchImportBatch: vi.fn(),
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/server/import-dispatch", () => ({
  dispatchImportBatch,
}));

import { handler } from "../../netlify/functions/import-dispatch";

describe("import-dispatch Netlify function", () => {
  beforeEach(() => {
    getAdminSupabase.mockReset();
    dispatchImportBatch.mockReset();
    process.env.IMPORT_DISPATCH_SHARED_SECRET = "import-secret";
    process.env.AI_DISPATCH_SHARED_SECRET = "";
  });

  it("rejects unauthorized requests", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        organizationId: "org_1",
        batchId: "batch_1",
      }),
      headers: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("dispatches the batch when a valid secret is supplied", async () => {
    const admin = { name: "admin" };
    getAdminSupabase.mockReturnValue(admin);
    dispatchImportBatch.mockResolvedValue({
      acceptedCount: 1,
      rejectedCount: 0,
      rowCountTotal: 1,
      status: "completed",
    });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      }),
      headers: {
        "x-dependableqa-import-dispatch": "import-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(dispatchImportBatch).toHaveBeenCalledWith(admin, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });
  });
});
