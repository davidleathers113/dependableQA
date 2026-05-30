import type { APIRoute } from "astro";
import { ZodError } from "zod";
import { requireApiSession } from "../../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";
import { loadIntegrationContext } from "../../../../server/integration-ingest";
import {
  ringbaManualImportInputSchema,
  runRingbaManualImport,
} from "../../../../server/ringba-import";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function canManageIntegrations(role: string) {
  return role === "owner" || role === "admin";
}

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!canManageIntegrations(session.organization.role)) {
    return json({ error: "Only owners and admins can run Ringba imports." }, 403);
  }

  const rawBody = await context.request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return json({ error: "Request body must be a JSON object." }, 400);
  }

  const body = rawBody as Record<string, unknown>;
  const integrationId = typeof body.integrationId === "string" ? body.integrationId : "";
  if (!integrationId) {
    return json({ error: "integrationId is required." }, 400);
  }

  let input;
  try {
    input = ringbaManualImportInputSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: error.issues[0]?.message ?? "Invalid import request." }, 400);
    }
    return json({ error: "Invalid import request." }, 400);
  }

  const admin = getAdminSupabase();
  const integration = await loadIntegrationContext(admin, integrationId);
  if (!integration || integration.provider !== "ringba") {
    return json({ error: "Ringba integration not found." }, 404);
  }
  if (integration.organizationId !== session.organization.id) {
    return json({ error: "Ringba integration not found." }, 404);
  }

  try {
    const result = await runRingbaManualImport(admin, integration, {
      ...input,
      requestedBy: session.user.id,
    });

    if (result.status === "failed") {
      return json({ ok: false, ...result }, 502);
    }

    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unable to run Ringba import." },
      400
    );
  }
};
