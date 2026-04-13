import type { APIRoute } from "astro";
import { requireApiSession } from "../../../../lib/auth/request-session";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";

export const prerender = false;

const SIGNED_URL_TTL_SECONDS = 3600;

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
    .select("id, recording_storage_path")
    .eq("organization_id", session.organization.id)
    .eq("id", callId)
    .single();

  if (callResult.error || !callResult.data) {
    return new Response(JSON.stringify({ error: callResult.error?.message ?? "Call not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const row = callResult.data as Record<string, unknown>;
  const storagePath = typeof row.recording_storage_path === "string" ? row.recording_storage_path.trim() : "";

  if (!storagePath) {
    return new Response(JSON.stringify({ error: "No recording available for this call." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const admin = getAdminSupabase();
  const signed = await admin.storage.from("recordings").createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    return new Response(JSON.stringify({ error: signed.error?.message ?? "Unable to sign recording URL." }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

  return new Response(JSON.stringify({ url: signed.data.signedUrl, expiresAt }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
