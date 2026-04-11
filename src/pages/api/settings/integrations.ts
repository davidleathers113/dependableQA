import type { APIRoute } from "astro";
import {
  getIntegrationsSummary,
  insertAuditLog,
  SUPPORTED_INTEGRATION_CATALOG,
  type IntegrationProvider,
} from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";
import {
  normalizeIntegrationWebhookAuthInput,
  type IntegrationWebhookAuthType,
} from "../../../lib/integration-config";
import type { TablesInsert } from "../../../../supabase/types";
import { sendIntegrationTestEvent } from "../../../server/integration-test-event";

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

function normalizeProvider(value: unknown): IntegrationProvider | null {
  const provider = asString(value);
  if (provider === "ringba" || provider === "trackdrive" || provider === "retreaver" || provider === "custom") {
    return provider;
  }

  return null;
}

function getSummaryDefaults() {
  const env = typeof process !== "undefined" ? process.env : {};
  return {
    fallbackSecretConfigured: Boolean(env.INTEGRATION_INGEST_SHARED_SECRET),
    fallbackHeaderName: env.INTEGRATION_INGEST_SIGNATURE_HEADER,
    fallbackPrefix: env.INTEGRATION_INGEST_SIGNATURE_PREFIX,
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
  const admin = getAdminSupabase();
  let message = "";
  let integrationId = asString(body.integrationId);

  if (action === "create-integration") {
    const provider = normalizeProvider(body.provider);
    if (!provider) {
      return json({ error: "provider is required." }, 400);
    }

    const existingByProvider = await admin
      .from("integrations")
      .select("id, display_name")
      .eq("organization_id", session.organization.id)
      .eq("provider", provider)
      .maybeSingle();

    if (existingByProvider.error) {
      return json({ error: existingByProvider.error.message }, 500);
    }

    if (existingByProvider.data) {
      integrationId = asString(existingByProvider.data.id);
      message = `${asString(existingByProvider.data.display_name) || "Integration"} already exists.`;
    } else {
      const catalogEntry = SUPPORTED_INTEGRATION_CATALOG.find((entry) => entry.provider === provider);
      const displayName = asString(body.displayName) || catalogEntry?.defaultDisplayName || "Integration";
      const nextConfig = normalizeIntegrationWebhookAuthInput(
        {},
        {
          authType: "hmac-sha256",
          headerName: getSummaryDefaults().fallbackHeaderName || "x-dependableqa-signature",
          prefix: getSummaryDefaults().fallbackPrefix || "sha256=",
          secret: "",
        }
      );

      const insertValues: TablesInsert<"integrations"> = {
        organization_id: session.organization.id,
        provider,
        display_name: displayName,
        mode: catalogEntry?.defaultMode || "webhook",
        status: "disconnected",
        config: nextConfig,
      };

      const created = await admin.from("integrations").insert(insertValues).select("id, display_name").single();
      if (created.error || !created.data) {
        return json({ error: created.error?.message ?? "Unable to create integration." }, 500);
      }

      integrationId = asString((created.data as Record<string, unknown>).id);
      message = `${displayName} created.`;

      await insertAuditLog(admin, {
        organizationId: session.organization.id,
        actorUserId: session.user.id,
        entityType: "integration",
        entityId: integrationId,
        action: "integration.created",
        metadata: {
          summary: `Created integration for ${displayName}.`,
          provider,
        },
      });
    }
  } else {
    if (!integrationId) {
      return json({ error: "integrationId is required." }, 400);
    }

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

    if (action === "update-webhook-auth") {
      const authType = normalizeAuthType(body.authType);
      const headerName = asString(body.headerName);
      const prefix = asString(body.prefix);
      const secret = asString(body.secret);

      if (!authType) {
        return json({ error: "authType must be shared-secret or hmac-sha256." }, 400);
      }

      if (!headerName) {
        return json({ error: "headerName is required." }, 400);
      }

      if (headerName.includes(" ")) {
        return json({ error: "headerName cannot contain spaces." }, 400);
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

      message = "Webhook security settings saved.";
    } else if (action === "send-test-event") {
      try {
        const result = await sendIntegrationTestEvent(admin, integrationId);
        message = result.message;
      } catch (error) {
        return json(
          {
            error: error instanceof Error ? error.message : "Unable to generate a signed test event for this integration.",
          },
          400
        );
      }
    } else {
      return json({ error: "Unsupported action." }, 400);
    }
  }

  const summary = await getIntegrationsSummary(admin, session.organization.id, getSummaryDefaults());
  const provider = normalizeProvider(body.provider);
  const integration =
    summary.integrations.find((item) => item.id === integrationId) ??
    (provider ? summary.integrations.find((item) => item.provider === provider) : null) ??
    null;

  return json({
    ok: true,
    message,
    integration,
  });
};
