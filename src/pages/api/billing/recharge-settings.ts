import type { APIRoute } from "astro";
import { formatCurrency, insertAuditLog } from "../../../lib/app-data";
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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
  return value === true;
}

function asInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  return null;
}

function canManageBilling(role: string) {
  return role === "owner" || role === "admin" || role === "billing";
}

function buildSummary(before: {
  autopayEnabled: boolean;
  rechargeAmountCents: number;
  rechargeThresholdCents: number;
}, after: {
  autopayEnabled: boolean;
  rechargeAmountCents: number;
  rechargeThresholdCents: number;
}) {
  const parts: string[] = [];

  if (before.autopayEnabled !== after.autopayEnabled) {
    parts.push(after.autopayEnabled ? "Auto-recharge turned on" : "Auto-recharge turned off");
  }

  if (before.rechargeThresholdCents !== after.rechargeThresholdCents) {
    parts.push(
      `Recharge threshold changed from ${formatCurrency(before.rechargeThresholdCents)} to ${formatCurrency(after.rechargeThresholdCents)}`
    );
  }

  if (before.rechargeAmountCents !== after.rechargeAmountCents) {
    parts.push(
      `Recharge amount changed from ${formatCurrency(before.rechargeAmountCents)} to ${formatCurrency(after.rechargeAmountCents)}`
    );
  }

  return parts.join(". ") || "Auto-recharge settings updated";
}

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!canManageBilling(session.organization.role)) {
    return json({ error: "Only owners, admins, and billing users can update billing settings." }, 403);
  }

  const rawBody = await context.request.json().catch(() => null);
  const body = asRecord(rawBody);
  if (!body) {
    return json({ error: "Request body must be a JSON object." }, 400);
  }

  const requestedOrganizationId = asString(body.organizationId);
  if (requestedOrganizationId && requestedOrganizationId !== session.organization.id) {
    return json({ error: "Billing settings can only be updated for the active organization." }, 403);
  }

  const rechargeAmountCents = asInteger(body.rechargeAmountCents);
  const rechargeThresholdCents = asInteger(body.rechargeThresholdCents);
  const autopayEnabled = asBoolean(body.autopayEnabled);

  if (rechargeAmountCents === null || rechargeAmountCents <= 0) {
    return json({ error: "rechargeAmountCents must be a positive integer." }, 400);
  }

  if (rechargeThresholdCents === null || rechargeThresholdCents < 0) {
    return json({ error: "rechargeThresholdCents must be zero or greater." }, 400);
  }

  const admin = getAdminSupabase();
  const existing = await admin
    .from("billing_accounts")
    .select("id, autopay_enabled, recharge_amount_cents, recharge_threshold_cents")
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (existing.error) {
    return json({ error: existing.error.message }, 500);
  }

  if (!existing.data) {
    return json({ error: "Billing account not found." }, 404);
  }

  const updateResult = await admin
    .from("billing_accounts")
    .update({
      autopay_enabled: autopayEnabled,
      recharge_amount_cents: rechargeAmountCents,
      recharge_threshold_cents: rechargeThresholdCents,
    })
    .eq("id", String(existing.data.id));

  if (updateResult.error) {
    return json({ error: updateResult.error.message }, 500);
  }

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "billing_account",
    entityId: String(existing.data.id),
    action: "billing.recharge_settings.updated",
    before: {
      autopayEnabled: Boolean(existing.data.autopay_enabled),
      rechargeAmountCents: Number(existing.data.recharge_amount_cents ?? 0),
      rechargeThresholdCents: Number(existing.data.recharge_threshold_cents ?? 0),
    },
    after: {
      autopayEnabled,
      rechargeAmountCents,
      rechargeThresholdCents,
    },
    metadata: {
      summary: buildSummary(
        {
          autopayEnabled: Boolean(existing.data.autopay_enabled),
          rechargeAmountCents: Number(existing.data.recharge_amount_cents ?? 0),
          rechargeThresholdCents: Number(existing.data.recharge_threshold_cents ?? 0),
        },
        {
          autopayEnabled,
          rechargeAmountCents,
          rechargeThresholdCents,
        }
      ),
    },
  });

  return json({
    ok: true,
    autopayEnabled,
    rechargeAmountCents,
    rechargeThresholdCents,
  });
};
