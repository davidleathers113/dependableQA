import { beforeEach, describe, expect, it, vi } from "vitest";

// Netlify blocks direct public HTTP invocation of scheduled functions in
// production (they only run on their schedule), so these handlers intentionally
// carry no endpoint auth. These tests pin the run-and-report behavior and error
// handling of the two scheduled wrappers.

const { getAdminSupabase, runAiJobs, runRingbaApiSyncForAllEligibleIntegrations } = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(() => ({})),
  runAiJobs: vi.fn(),
  runRingbaApiSyncForAllEligibleIntegrations: vi.fn(),
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({ getAdminSupabase }));
vi.mock("../../src/server/ai-jobs", () => ({ runAiJobs }));
vi.mock("../../src/server/ringba-api-sync", () => ({ runRingbaApiSyncForAllEligibleIntegrations }));

import { handler as aiDispatchScheduled } from "../../netlify/functions/ai-dispatch-scheduled";
import { handler as ringbaApiSyncScheduled } from "../../netlify/functions/ringba-api-sync-scheduled";

beforeEach(() => {
  getAdminSupabase.mockClear();
  runAiJobs.mockReset();
  runRingbaApiSyncForAllEligibleIntegrations.mockReset();
});

describe("ai-dispatch-scheduled", () => {
  it("runs the AI job queue and reports processed/recovered counts", async () => {
    runAiJobs.mockResolvedValue({ processed: [{ id: "a" }, { id: "b" }], recovered: [{ id: "c" }] });

    const response = await aiDispatchScheduled();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, processedCount: 2, recoveredCount: 1 });
    expect(runAiJobs).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the runner throws", async () => {
    runAiJobs.mockRejectedValue(new Error("queue exploded"));

    const response = await aiDispatchScheduled();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({ error: "queue exploded" });
  });
});

describe("ringba-api-sync-scheduled", () => {
  it("runs the Ringba sync and reports processed/error counts", async () => {
    runRingbaApiSyncForAllEligibleIntegrations.mockResolvedValue({ processed: 3, errors: 1 });

    const response = await ringbaApiSyncScheduled();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, processed: 3, errors: 1 });
    expect(runRingbaApiSyncForAllEligibleIntegrations).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the sync runner throws", async () => {
    runRingbaApiSyncForAllEligibleIntegrations.mockRejectedValue(new Error("ringba down"));

    const response = await ringbaApiSyncScheduled();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({ error: "ringba down" });
  });
});
