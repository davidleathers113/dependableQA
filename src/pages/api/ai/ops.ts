import type { APIRoute } from "astro";
import { getAiOperationsSummary } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export const GET: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const summary = await getAiOperationsSummary(getAdminSupabase(), session.organization.id);
    return json(summary);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unable to load AI operations.",
      },
      500
    );
  }
};
