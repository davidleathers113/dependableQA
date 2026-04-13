import type { SupabaseClient } from "@supabase/supabase-js";
import { isIP } from "node:net";
import { toFile } from "openai";
import type { Database, Json } from "../../supabase/types";
import { getOpenAiClient, getOpenAiServerConfig } from "../lib/openai/server-client";

type SupabaseAny = SupabaseClient<Database>;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

interface RecordingSource {
  bytes: Buffer;
  contentType: string;
  fileName: string;
  storagePath: string | null;
}

interface MinimalTranscriptSegment {
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
}

interface MinimalDiarizedTranscription {
  duration?: number;
  segments?: MinimalTranscriptSegment[];
  text?: string;
  usage?: unknown;
}

type NonRetryableError = Error & { retryable?: boolean };

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferFileExtension(contentType: string, sourceName: string) {
  const normalizedType = contentType.trim().toLowerCase();
  const normalizedName = sourceName.trim().toLowerCase();

  if (normalizedName.endsWith(".mp3") || normalizedType.includes("mpeg")) return ".mp3";
  if (normalizedName.endsWith(".wav") || normalizedType.includes("wav")) return ".wav";
  if (normalizedName.endsWith(".m4a") || normalizedType.includes("mp4") || normalizedType.includes("m4a")) return ".m4a";
  if (normalizedName.endsWith(".mp4")) return ".mp4";
  if (normalizedName.endsWith(".webm") || normalizedType.includes("webm")) return ".webm";
  if (normalizedName.endsWith(".ogg") || normalizedType.includes("ogg")) return ".ogg";

  return ".audio";
}

function normalizeSpeaker(value: string | undefined) {
  const speaker = asString(value);
  return speaker || "Unknown speaker";
}

function buildTranscriptSegments(segments: MinimalTranscriptSegment[] | undefined) {
  const normalized: Json[] = [];

  for (const segment of segments ?? []) {
    const text = asString(segment.text);
    if (!text) {
      continue;
    }

    const start = asNumber(segment.start);
    const end = asNumber(segment.end);
    const entry: Record<string, Json> = {
      speaker: normalizeSpeaker(segment.speaker),
      text,
    };

    if (start !== null) {
      entry.start = start;
    }

    if (end !== null) {
      entry.end = end;
    }

    normalized.push(entry);
  }

  return normalized;
}

function inferDurationSeconds(
  callRow: Record<string, unknown>,
  transcription: MinimalDiarizedTranscription
) {
  const transcriptDuration = asNumber(transcription.duration);
  if (transcriptDuration !== null) {
    return Math.round(transcriptDuration);
  }

  const usage = transcription.usage as Record<string, unknown> | null;
  const usageSeconds = usage && typeof usage.seconds === "number" ? usage.seconds : null;
  if (usageSeconds !== null) {
    return Math.round(usageSeconds);
  }

  const callDuration = typeof callRow.duration_seconds === "number" ? callRow.duration_seconds : null;
  return callDuration ?? 0;
}

function createNonRetryableError(message: string) {
  const error = new Error(message) as NonRetryableError;
  error.retryable = false;
  return error;
}

function isBlockedIpv4Host(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) {
    return true;
  }

  if (parts[0] === 169 && parts[1] === 254) {
    return true;
  }

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return parts[0] === 192 && parts[1] === 168;
}

function isBlockedIpv6Host(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "::1") {
    return true;
  }

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function assertSafeRecordingUrl(urlText: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlText);
  } catch {
    throw createNonRetryableError("Recording URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw createNonRetryableError("Recording URL must use http or https.");
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  if (!hostname) {
    throw createNonRetryableError("Recording URL hostname is required.");
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw createNonRetryableError("Recording URL hostname is not allowed.");
  }

  const ipVersion = isIP(hostname);
  if (
    (ipVersion === 4 && isBlockedIpv4Host(hostname)) ||
    (ipVersion === 6 && isBlockedIpv6Host(hostname))
  ) {
    throw createNonRetryableError("Recording URL must not target a private or loopback host.");
  }

  return parsedUrl;
}

async function loadCallForTranscription(client: SupabaseAny, organizationId: string, callId: string) {
  const result = await client
    .from("calls")
    .select("id, organization_id, recording_url, recording_storage_path, duration_seconds")
    .eq("organization_id", organizationId)
    .eq("id", callId)
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Unable to load call recording.");
  }

  return result.data as Record<string, unknown>;
}

async function downloadRecordingFromStorage(client: SupabaseAny, storagePath: string) {
  const download = await client.storage.from("recordings").download(storagePath);
  if (download.error || !download.data) {
    throw new Error(download.error?.message ?? "Unable to download the stored recording.");
  }

  const bytes = Buffer.from(await download.data.arrayBuffer());
  return {
    bytes,
    contentType: download.data.type || "audio/mpeg",
    fileName: storagePath.split("/").at(-1) || "recording.audio",
    storagePath,
  } satisfies RecordingSource;
}

async function downloadRecordingFromUrl(
  client: SupabaseAny,
  callRow: Record<string, unknown>,
  urlText: string
) {
  const safeUrl = assertSafeRecordingUrl(urlText);
  const response = await fetch(urlText);
  if (!response.ok) {
    throw new Error(`Unable to fetch recording. Upstream returned ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.trim() || "audio/mpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  const rawName = safeUrl.pathname.split("/").at(-1) || "recording";
  const extension = inferFileExtension(contentType, rawName);
  const storagePath = `${asString(callRow.organization_id)}/${asString(callRow.id)}${extension}`;

  const upload = await client.storage.from("recordings").upload(storagePath, bytes, {
    contentType,
    upsert: true,
  });
  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const callUpdate = await client
    .from("calls")
    .update({
      recording_storage_path: storagePath,
    })
    .eq("organization_id", asString(callRow.organization_id))
    .eq("id", asString(callRow.id));

  if (callUpdate.error) {
    throw new Error(callUpdate.error.message);
  }

  return {
    bytes,
    contentType,
    fileName: rawName.endsWith(extension) ? rawName : `${rawName}${extension}`,
    storagePath,
  } satisfies RecordingSource;
}

async function loadRecordingSource(client: SupabaseAny, callRow: Record<string, unknown>) {
  const storagePath = asString(callRow.recording_storage_path);
  if (storagePath) {
    return downloadRecordingFromStorage(client, storagePath);
  }

  const recordingUrl = asString(callRow.recording_url);
  if (!recordingUrl) {
    throw new Error("This call does not have a recording source.");
  }

  return downloadRecordingFromUrl(client, callRow, recordingUrl);
}

function assertRecordingSize(source: RecordingSource) {
  if (source.bytes.byteLength > MAX_AUDIO_BYTES) {
    throw createNonRetryableError(
      "Recording exceeds the 25 MB transcription limit. Upload a smaller file or add chunking support before retrying."
    );
  }
}

export async function transcribeCall(
  client: SupabaseAny,
  options: {
    organizationId: string;
    callId: string;
    language?: string | null;
  }
) {
  const callRow = await loadCallForTranscription(client, options.organizationId, options.callId);
  const source = await loadRecordingSource(client, callRow);
  assertRecordingSize(source);

  const openAiClient = getOpenAiClient();
  const config = getOpenAiServerConfig();
  const uploadableFile = await toFile(source.bytes, source.fileName, {
    type: source.contentType,
  });

  const response = (await openAiClient.audio.transcriptions.create({
    file: uploadableFile,
    model: config.transcriptionModel,
    response_format: "diarized_json",
    chunking_strategy: "auto",
    language: asString(options.language ?? undefined) || undefined,
  })) as unknown as MinimalDiarizedTranscription;

  const transcriptText = asString(response.text);
  if (!transcriptText) {
    throw new Error("Transcription completed without transcript text.");
  }

  const transcriptSegments = buildTranscriptSegments(response.segments);
  const durationSeconds = inferDurationSeconds(callRow, response);

  const transcriptWrite = await client.from("call_transcripts").upsert(
    {
      organization_id: options.organizationId,
      call_id: options.callId,
      transcript_text: transcriptText,
      transcript_segments: transcriptSegments,
      language: asString(options.language ?? undefined) || "en",
      provider: "openai",
      model_name: config.transcriptionModel,
      response_format: "diarized_json",
      duration_seconds: durationSeconds,
      usage_json: (response.usage ?? null) as Json | null,
      raw_response_json: response as Json,
      transcription_version: "v1",
      confidence: null,
    },
    {
      onConflict: "call_id",
    }
  );

  if (transcriptWrite.error) {
    throw new Error(transcriptWrite.error.message);
  }

  const callUpdate = await client
    .from("calls")
    .update({
      transcription_status: "completed",
      transcription_completed_at: new Date().toISOString(),
      transcription_error: null,
      recording_storage_path: source.storagePath || asString(callRow.recording_storage_path) || null,
    })
    .eq("organization_id", options.organizationId)
    .eq("id", options.callId);

  if (callUpdate.error) {
    throw new Error(callUpdate.error.message);
  }

  return {
    transcriptText,
    transcriptSegments,
    durationSeconds,
    modelName: config.transcriptionModel,
  };
}
