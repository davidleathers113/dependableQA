import type { APIRoute } from "astro";
import { randomBytes, createHash } from "node:crypto";
import { insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function normalizeLabel(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canManageKeys(role: string) {
  return role === "owner" || role === "admin";
}

function createPlaintextKey() {
  return `dq_live_${randomBytes(18).toString("hex")}`;
}

function createTokenHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!canManageKeys(session.organization.role)) {
    return json({ error: "Only owners and admins can manage API keys." }, 403);
  }

  const body = (await context.request.json().catch(() => null)) as
    | { action?: string; label?: string; keyId?: string }
    | null;

  if (!body?.action) {
    return json({ error: "action is required" }, 400);
  }

  const admin = getAdminSupabase();

  if (body.action === "create") {
    const label = normalizeLabel(body.label);
    if (!label) {
      return json({ error: "label is required" }, 400);
    }

    const secret = createPlaintextKey();
    const tokenPrefix = secret.slice(0, 12);
    const tokenHash = createTokenHash(secret);

    const insertResult = await admin
      .from("api_keys")
      .insert({
        organization_id: session.organization.id,
        label,
        token_prefix: tokenPrefix,
        token_hash: tokenHash,
        scopes: [],
        created_by: session.user.id,
      })
      .select("id")
      .single();

    if (insertResult.error || !insertResult.data) {
      return json({ error: insertResult.error?.message ?? "Unable to create API key." }, 500);
    }

    await insertAuditLog(admin, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      entityType: "api_key",
      entityId: String((insertResult.data as Record<string, unknown>).id ?? ""),
      action: "api_key.created",
      metadata: {
        summary: `Created API key ${label}.`,
      },
    });

    return json({ ok: true, secret });
  }

  if (body.action === "revoke") {
    const keyId = normalizeKeyId(body.keyId);
    if (!keyId) {
      return json({ error: "keyId is required" }, 400);
    }

    const existing = await admin
      .from("api_keys")
      .select("id, label")
      .eq("organization_id", session.organization.id)
      .eq("id", keyId)
      .maybeSingle();

    if (existing.error || !existing.data) {
      return json({ error: existing.error?.message ?? "API key not found." }, 404);
    }

    const revokeResult = await admin
      .from("api_keys")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("organization_id", session.organization.id)
      .eq("id", keyId);

    if (revokeResult.error) {
      return json({ error: revokeResult.error.message }, 500);
    }

    await insertAuditLog(admin, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      entityType: "api_key",
      entityId: keyId,
      action: "api_key.revoked",
      metadata: {
        summary: `Revoked API key ${String((existing.data as Record<string, unknown>).label ?? "")}.`,
      },
    });

    return json({ ok: true });
  }

  return json({ error: "Unsupported action." }, 400);
};
