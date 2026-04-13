import type { APIRoute } from "astro";
import type { Json } from "../../../../../supabase/types";
import { insertAuditLog } from "../../../../lib/app-data";
import {
  createManualFlagSchema,
  patchManualFlagSchema,
  validateFlagTimes,
} from "../../../../lib/call-review-api-schemas";
import { requireApiSession } from "../../../../lib/auth/request-session";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const callId = context.params.callId;
  if (!callId) {
    return new Response(JSON.stringify({ error: "Missing callId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const raw = (await context.request.json().catch(() => null)) as unknown;
  const parsed = createManualFlagSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const rangeError = validateFlagTimes(parsed.data.startSeconds ?? undefined, parsed.data.endSeconds ?? undefined);
  if (rangeError) {
    return new Response(JSON.stringify({ error: rangeError }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createServerSupabaseClient(context.request, context.cookies) as any;
  const admin = getAdminSupabase();

  const callResult = await supabase
    .from("calls")
    .select("id")
    .eq("organization_id", session.organization.id)
    .eq("id", callId)
    .single();

  if (callResult.error || !callResult.data) {
    return new Response(JSON.stringify({ error: callResult.error?.message ?? "Call not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const startSeconds =
    parsed.data.startSeconds === undefined ? null : parsed.data.startSeconds;
  const endSeconds = parsed.data.endSeconds === undefined ? null : parsed.data.endSeconds;

  const insertResult = await supabase.from("call_flags").insert({
    organization_id: session.organization.id,
    call_id: callId,
    flag_type: "manual_review",
    flag_category: parsed.data.flagCategory,
    severity: parsed.data.severity,
    source: "manual",
    status: "open",
    title: parsed.data.title,
    description: parsed.data.description?.length ? parsed.data.description : null,
    start_seconds: startSeconds,
    end_seconds: endSeconds,
    evidence: {},
  }).select("id").single();

  if (insertResult.error || !insertResult.data) {
    return new Response(JSON.stringify({ error: insertResult.error?.message ?? "Unable to create flag." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const newId = String((insertResult.data as Record<string, unknown>).id);

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "call_flag",
    entityId: newId,
    action: "call.flag.created",
    metadata: {
      summary: `Manual flag: ${parsed.data.title}`,
      callId,
    },
  });

  return new Response(JSON.stringify({ id: newId }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};

export const PATCH: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const callId = context.params.callId;
  if (!callId) {
    return new Response(JSON.stringify({ error: "Missing callId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const raw = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw.flagId !== "string" || !raw.flagId.trim()) {
    return new Response(JSON.stringify({ error: "flagId is required." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const flagId = raw.flagId.trim();
  const { flagId: _omit, ...patchBody } = raw;
  const parsed = patchManualFlagSchema.safeParse(patchBody);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    return new Response(JSON.stringify({ error: "No fields to update." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createServerSupabaseClient(context.request, context.cookies) as any;
  const admin = getAdminSupabase();

  const currentFlag = await supabase
    .from("call_flags")
    .select("id, source, title, description, flag_category, severity, start_seconds, end_seconds, status")
    .eq("organization_id", session.organization.id)
    .eq("call_id", callId)
    .eq("id", flagId)
    .single();

  if (currentFlag.error || !currentFlag.data) {
    return new Response(JSON.stringify({ error: currentFlag.error?.message ?? "Flag not found." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const row = currentFlag.data as Record<string, unknown>;
  if (asString(row.source) !== "manual") {
    return new Response(JSON.stringify({ error: "Only manual flags can be edited." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const nextStart =
    parsed.data.startSeconds !== undefined ? parsed.data.startSeconds : (row.start_seconds as number | null);
  const nextEnd =
    parsed.data.endSeconds !== undefined ? parsed.data.endSeconds : (row.end_seconds as number | null);

  const rangeError = validateFlagTimes(nextStart ?? undefined, nextEnd ?? undefined);
  if (rangeError) {
    return new Response(JSON.stringify({ error: rangeError }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.flagCategory !== undefined) {
    updatePayload.flag_category = parsed.data.flagCategory;
  }
  if (parsed.data.severity !== undefined) {
    updatePayload.severity = parsed.data.severity;
  }
  if (parsed.data.title !== undefined) {
    updatePayload.title = parsed.data.title;
  }
  if (parsed.data.description !== undefined) {
    updatePayload.description = parsed.data.description;
  }
  if (parsed.data.startSeconds !== undefined) {
    updatePayload.start_seconds = parsed.data.startSeconds;
  }
  if (parsed.data.endSeconds !== undefined) {
    updatePayload.end_seconds = parsed.data.endSeconds;
  }

  const updateResult = await supabase
    .from("call_flags")
    .update(updatePayload)
    .eq("organization_id", session.organization.id)
    .eq("id", flagId);

  if (updateResult.error) {
    return new Response(JSON.stringify({ error: updateResult.error.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "call_flag",
    entityId: flagId,
    action: "call.flag.updated",
    before: {
      title: row.title,
      description: row.description,
      flag_category: row.flag_category,
      severity: row.severity,
      start_seconds: row.start_seconds,
      end_seconds: row.end_seconds,
    } as Json,
    after: updatePayload as Json,
    metadata: {
      summary: "Updated manual flag.",
      callId,
    },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}
