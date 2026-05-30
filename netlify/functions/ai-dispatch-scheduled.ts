import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { runAiJobs } from "../../src/server/ai-jobs";
import { sweepExpiredProcessingHolds } from "../../src/server/ai-pricing";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function getBatchLimit() {
  const parsed = Number(process.env.AI_DISPATCH_BATCH_LIMIT ?? "5");
  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.max(1, Math.min(Math.round(parsed), 25));
}

export async function handler() {
  try {
    const admin = getAdminSupabase();

    // Best-effort: reclaim reservations from jobs that vanished without settling
    // or releasing, so a lost job can't leak available wallet balance. Never
    // block dispatch on this. See migration 0018.
    let sweptHolds = 0;
    try {
      sweptHolds = await sweepExpiredProcessingHolds(admin);
    } catch {
      sweptHolds = 0;
    }

    const result = await runAiJobs(admin, {
      limit: getBatchLimit(),
    });

    return json(200, {
      ok: true,
      processedCount: result.processed.length,
      recoveredCount: result.recovered.length,
      sweptHolds,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to run scheduled AI jobs.",
    });
  }
}
