import type { APIRoute } from "astro";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";
import { dispatchImportBatch } from "../../../server/import-dispatch";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await context.request.json().catch(() => null);
  const batchId = typeof body?.batchId === "string" ? body.batchId : "";

  if (!batchId) {
    return new Response(JSON.stringify({ error: "batchId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await dispatchImportBatch(getAdminSupabase(), {
      organizationId: session.organization.id,
      batchId,
      actorUserId: session.user.id,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unable to dispatch import batch.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
