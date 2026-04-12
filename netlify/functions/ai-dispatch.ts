import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { runAiJobs, type AiJobType } from "../../src/server/ai-jobs";
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

function asJobType(value: unknown): AiJobType | null {
  const normalized = asString(value);
  if (normalized === "transcription" || normalized === "analysis") {
    return normalized;
  }

  return null;
}

export async function handler(event: {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
}) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const expectedSecret = asString(process.env.AI_DISPATCH_SHARED_SECRET);
  if (!expectedSecret) {
    return json(503, { error: "AI dispatch is not configured." });
  }

  const providedSecret = getHeaderValue(event.headers, "x-dependableqa-ai-dispatch");
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
  const rawLimit = typeof body.limit === "number" ? body.limit : 5;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.round(rawLimit), 25)) : 5;
  const jobType = asJobType(body.jobType);

  try {
    const processed = await runAiJobs(getAdminSupabase(), {
      limit,
      jobType,
    });

    return json(200, {
      processedCount: processed.processed.length,
      recoveredCount: processed.recovered.length,
      processed: processed.processed,
      recovered: processed.recovered,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unable to dispatch AI jobs.",
    });
  }
}
