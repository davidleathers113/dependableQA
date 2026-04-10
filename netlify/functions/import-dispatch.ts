import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { dispatchImportBatch } from "../../src/server/import-dispatch";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: { httpMethod?: string; body?: string | null }) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const payload = event.body ? JSON.parse(event.body) : {};
  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId : "";
  const batchId = typeof payload.batchId === "string" ? payload.batchId : "";
  const actorUserId = typeof payload.actorUserId === "string" ? payload.actorUserId : null;

  if (!organizationId || !batchId) {
    return json(400, { error: "organizationId and batchId are required" });
  }

  try {
    const result = await dispatchImportBatch(getAdminSupabase(), {
      organizationId,
      batchId,
      actorUserId,
    });

    return json(200, result);
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to dispatch import batch",
    });
  }
}
