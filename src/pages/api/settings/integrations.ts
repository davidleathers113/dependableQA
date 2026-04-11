import type { APIRoute } from "astro";
import { getIntegrationsSummary, insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";
import {
  normalizeIntegrationWebhookAuthInput,
  type IntegrationWebhookAuthType,
} from "../../../lib/integration-config";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canManageIntegrations(role: string) {
  return role === "owner" || role === "admin";
}

function normalizeAuthType(value: unknown): IntegrationWebhookAuthType | null {
  const authType = asString(value);
  if (authType === "shared-secret" || authType === "hmac-sha256") {
    return authType;
  }

  return null;
}

function getSummaryDefaults() {
  return {
    fallbackSecretConfigured: Boolean(import.meta.env.INTEGRATION_INGEST_SHARED_SECRET),
    fallbackHeaderName: import.meta.env.INTEGRATION_INGEST_SIGNATURE_HEADER,
    fallbackPrefix: import.meta.env.INTEGRATION_INGEST_SIGNATURE_PREFIX,
  };
}

export const GET: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  const summary = await getIntegrationsSummary(
    getAdminSupabase(),
    session.organization.id,
    getSummaryDefaults()
  );

  return json(summary);
};

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!canManageIntegrations(session.organization.role)) {
    return json({ error: "Only owners and admins can manage integrations." }, 403);
  }

  const rawBody = await context.request.json().catch(() => null);
  const body = asRecord(rawBody);
  if (!body) {
    return json({ error: "Request body must be a JSON object." }, 400);
  }

  const action = asString(body.action);
  if (action !== "update-webhook-auth") {
    return json({ error: "Unsupported action." }, 400);
  }

  const integrationId = asString(body.integrationId);
  const authType = normalizeAuthType(body.authType);
  const headerName = asString(body.headerName);
  const prefix = asString(body.prefix);
  const secret = asString(body.secret);

  if (!integrationId) {
    return json({ error: "integrationId is required." }, 400);
  }

  if (!authType) {
    return json({ error: "authType must be shared-secret or hmac-sha256." }, 400);
  }

  if (!headerName) {
    return json({ error: "headerName is required." }, 400);
  }

  if (headerName.includes(" ")) {
    return json({ error: "headerName cannot contain spaces." }, 400);
  }

  const admin = getAdminSupabase();
  const existing = await admin
    .from("integrations")
    .select("id, display_name, config")
    .eq("organization_id", session.organization.id)
    .eq("id", integrationId)
    .maybeSingle();

  if (existing.error) {
    return json({ error: existing.error.message }, 500);
  }

  if (!existing.data) {
    return json({ error: "Integration not found." }, 404);
  }

  const nextConfig = normalizeIntegrationWebhookAuthInput(existing.data.config, {
    authType,
    headerName,
    prefix,
    secret,
  });

  const updateResult = await admin
    .from("integrations")
    .update({
      config: nextConfig,
    })
    .eq("organization_id", session.organization.id)
    .eq("id", integrationId);

  if (updateResult.error) {
    return json({ error: updateResult.error.message }, 500);
  }

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "integration",
    entityId: integrationId,
    action: "integration.config.updated",
    metadata: {
      summary: `Updated webhook auth settings for ${asString(existing.data.display_name) || "integration"}.`,
      authType,
      headerName,
      prefix,
      secretUpdated: secret.length > 0,
    },
  });

  const summary = await getIntegrationsSummary(admin, session.organization.id, getSummaryDefaults());
  const integration = summary.integrations.find((item) => item.id === integrationId) ?? null;

  return json({
    ok: true,
    integration,
  });
};
