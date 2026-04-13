import type { APIRoute } from "astro";
import { insertAuditLog } from "../../../../lib/app-data";
import { createNoteSchema, validateNoteTimes } from "../../../../lib/call-review-api-schemas";
import { requireApiSession } from "../../../../lib/auth/request-session";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
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

  const supabase = createServerSupabaseClient(context.request, context.cookies) as any;

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

  const notesResult = await supabase
    .from("call_review_notes")
    .select("id, body, start_seconds, end_seconds, created_at, created_by")
    .eq("organization_id", session.organization.id)
    .eq("call_id", callId)
    .order("created_at", { ascending: false });

  if (notesResult.error) {
    return new Response(JSON.stringify({ error: notesResult.error.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = (notesResult.data ?? []) as Array<Record<string, unknown>>;
  return new Response(
    JSON.stringify({
      notes: rows.map((n) => ({
        id: String(n.id),
        body: String(n.body),
        startSeconds: typeof n.start_seconds === "number" ? n.start_seconds : Number(n.start_seconds),
        endSeconds: n.end_seconds == null ? null : typeof n.end_seconds === "number" ? n.end_seconds : Number(n.end_seconds),
        createdAt: String(n.created_at),
        createdBy: String(n.created_by),
      })),
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
};

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
  const parsed = createNoteSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const rangeError = validateNoteTimes(parsed.data.startSeconds, parsed.data.endSeconds);
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

  const insertResult = await supabase
    .from("call_review_notes")
    .insert({
      organization_id: session.organization.id,
      call_id: callId,
      created_by: session.user.id,
      body: parsed.data.body,
      start_seconds: parsed.data.startSeconds,
      end_seconds: parsed.data.endSeconds ?? null,
    })
    .select("id")
    .single();

  if (insertResult.error || !insertResult.data) {
    return new Response(JSON.stringify({ error: insertResult.error?.message ?? "Unable to create note." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const newId = String((insertResult.data as Record<string, unknown>).id);

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "call",
    entityId: callId,
    action: "call.review_note.created",
    metadata: {
      summary: "Added timestamped review note.",
      noteId: newId,
    },
  });

  return new Response(JSON.stringify({ id: newId }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
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

  const url = new URL(context.request.url);
  const noteId = url.searchParams.get("noteId")?.trim();
  if (!noteId) {
    return new Response(JSON.stringify({ error: "noteId query parameter is required." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createServerSupabaseClient(context.request, context.cookies) as any;
  const admin = getAdminSupabase();

  const existing = await supabase
    .from("call_review_notes")
    .select("id")
    .eq("organization_id", session.organization.id)
    .eq("call_id", callId)
    .eq("id", noteId)
    .single();

  if (existing.error || !existing.data) {
    return new Response(JSON.stringify({ error: existing.error?.message ?? "Note not found." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const del = await supabase
    .from("call_review_notes")
    .delete()
    .eq("organization_id", session.organization.id)
    .eq("id", noteId);

  if (del.error) {
    return new Response(JSON.stringify({ error: del.error.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "call",
    entityId: callId,
    action: "call.review_note.deleted",
    metadata: {
      summary: "Deleted review note.",
      noteId,
    },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
