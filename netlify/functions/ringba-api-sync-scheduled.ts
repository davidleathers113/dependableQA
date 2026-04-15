import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { runRingbaApiSyncForAllEligibleIntegrations } from "../../src/server/ringba-api-sync";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export async function handler() {
  try {
    const result = await runRingbaApiSyncForAllEligibleIntegrations(getAdminSupabase());
    return json(200, {
      ok: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to run Ringba API sync.",
    });
  }
}
