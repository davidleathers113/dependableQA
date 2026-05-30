import type { APIRoute } from "astro";
import { z, ZodError } from "zod";
import { canSpendAi } from "../../../lib/auth/ai-spend-roles";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";
import { PREFLIGHT_MAX_BATCH, verifyRecordings } from "../../../server/recording-preflight";

export const prerender = false;

const verifyRecordingInputSchema = z.object({
  callIds: z
    .array(z.string().min(1))
    .min(1, "callIds must contain at least one call id.")
    .max(PREFLIGHT_MAX_BATCH, `A preflight request may check at most ${PREFLIGHT_MAX_BATCH} calls.`),
});

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
    return json({ error: "Your role cannot check recordings for analysis." }, 403);
  }

  const rawBody = await context.request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return json({ error: "Request body must be a JSON object." }, 400);
  }

  let input;
  try {
    input = verifyRecordingInputSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: error.issues[0]?.message ?? "Invalid request." }, 400);
    }
    return json({ error: "Invalid request." }, 400);
  }

  try {
    const results = await verifyRecordings(getAdminSupabase(), {
      organizationId: session.organization.id,
      callIds: input.callIds,
    });
    return json({ ok: true, results });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unable to check recordings." },
      400
    );
  }
};
