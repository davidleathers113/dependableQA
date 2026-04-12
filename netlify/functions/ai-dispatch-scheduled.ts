import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { runAiJobs } from "../../src/server/ai-jobs";

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
    const result = await runAiJobs(getAdminSupabase(), {
      limit: getBatchLimit(),
    });

    return json(200, {
      ok: true,
      processedCount: result.processed.length,
      recoveredCount: result.recovered.length,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to run scheduled AI jobs.",
    });
  }
}
