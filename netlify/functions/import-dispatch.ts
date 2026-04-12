import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { dispatchImportBatch } from "../../src/server/import-dispatch";
import { getHeaderValue, safeEqualText } from "../../src/server/netlify-request";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handler(event: {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
}) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const expectedSecret =
    asString(process.env.IMPORT_DISPATCH_SHARED_SECRET) || asString(process.env.AI_DISPATCH_SHARED_SECRET);
  if (!expectedSecret) {
    return json(503, { error: "Import dispatch is not configured." });
  }

  const providedSecret = getHeaderValue(event.headers, "x-dependableqa-import-dispatch");
  if (!providedSecret || !safeEqualText(providedSecret, expectedSecret)) {
    return json(401, { error: "Unauthorized" });
  }

  let payload: unknown = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const body = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  const actorUserId = typeof body.actorUserId === "string" ? body.actorUserId : null;

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
