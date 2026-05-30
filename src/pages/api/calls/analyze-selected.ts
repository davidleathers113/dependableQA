import type { APIRoute } from "astro";
import { ZodError } from "zod";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";
import {
  analyzeSelectedInputSchema,
  enqueueAnalysisForCalls,
} from "../../../server/analyze-selection";

export const prerender = false;

// This route is the OpenAI-spend gate: it turns imported calls into billable
// transcription/analysis jobs. Every current working role is allowed to spend
// (owners/admins, the billing role, and the reviewers/analysts who work the
// calls) — this is a deliberate product decision. The allowlist is explicit
// rather than "any member" so a future read-only role is denied spend by
// default instead of silently inheriting it.
const AI_SPEND_ROLES = new Set(["owner", "admin", "billing", "reviewer", "analyst"]);

function canSpendAi(role: string) {
  return AI_SPEND_ROLES.has(role);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!canSpendAi(session.organization.role)) {
    return json({ error: "Your role cannot queue AI analysis." }, 403);
  }

  const rawBody = await context.request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return json({ error: "Request body must be a JSON object." }, 400);
  }

  let input;
  try {
    input = analyzeSelectedInputSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: error.issues[0]?.message ?? "Invalid request." }, 400);
    }
    return json({ error: "Invalid request." }, 400);
  }

  try {
    const result = await enqueueAnalysisForCalls(getAdminSupabase(), {
      organizationId: session.organization.id,
      callIds: input.callIds ?? [],
      importBatchId: input.importBatchId ?? null,
      actorUserId: session.user.id,
    });

    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unable to queue analysis." },
      400
    );
  }
};
