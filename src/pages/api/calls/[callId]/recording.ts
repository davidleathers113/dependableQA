import type { APIRoute } from "astro";
import { requireApiSession } from "../../../../lib/auth/request-session";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";
import { fetchRecordingWithGuards } from "../../../../server/recording-fetch";

export const prerender = false;

const SIGNED_URL_TTL_SECONDS = 3600;
// Playback can materialize larger files than transcription (which is bounded by
// OpenAI's 25 MB limit). The body is buffered before upload, so keep a ceiling
// that bounds function memory while comfortably covering real call recordings.
const PLAYBACK_MAX_BYTES = 100 * 1024 * 1024;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  const callId = context.params.callId;
  if (!callId) {
    return json({ error: "Missing callId" }, 400);
  }

  const supabase = createServerSupabaseClient(context.request, context.cookies) as any;

  const callResult = await supabase
    .from("calls")
    .select("id, recording_storage_path, recording_url")
    .eq("organization_id", session.organization.id)
    .eq("id", callId)
    .single();

  if (callResult.error || !callResult.data) {
    return json({ error: callResult.error?.message ?? "Call not found" }, 404);
  }

  const row = callResult.data as Record<string, unknown>;
  let storagePath = typeof row.recording_storage_path === "string" ? row.recording_storage_path.trim() : "";
  const recordingUrl = typeof row.recording_url === "string" ? row.recording_url.trim() : "";

  if (!storagePath && !recordingUrl) {
    return json({ error: "No recording available for this call." }, 404);
  }

  const admin = getAdminSupabase();

  // Lazy materialization: Ringba/pixel imports store `recording_url` but no
  // storage object until transcription runs. Fetch + cache it on first playback
  // so reviewers can listen *before* spending on AI. This path NEVER enqueues a
  // transcription/analysis job — it only mirrors the audio into private storage.
  if (!storagePath && recordingUrl) {
    try {
      const fetched = await fetchRecordingWithGuards(recordingUrl, { maxBytes: PLAYBACK_MAX_BYTES });
      const materializedPath = `${session.organization.id}/${callId}${fetched.extension}`;

      const upload = await admin.storage
        .from("recordings")
        .upload(materializedPath, fetched.bytes, { contentType: fetched.contentType, upsert: true });
      if (upload.error) {
        throw new Error(upload.error.message);
      }

      const update = await admin
        .from("calls")
        .update({ recording_storage_path: materializedPath })
        .eq("organization_id", session.organization.id)
        .eq("id", callId);
      if (update.error) {
        throw new Error(update.error.message);
      }

      storagePath = materializedPath;
    } catch {
      // Sanitized: never echo the (possibly signed) recording URL.
      return json({ error: "Recording source unavailable or expired." }, 502);
    }
  }

  const signed = await admin.storage.from("recordings").createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    return json({ error: signed.error?.message ?? "Unable to sign recording URL." }, 502);
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

  return json({ url: signed.data.signedUrl, expiresAt }, 200);
};
