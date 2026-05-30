import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";
import { assertHostResolvesToPublic, assertSafeRecordingUrl, detectAudioExtension } from "./recording-fetch";

type SupabaseAny = SupabaseClient<Database>;

/** Transcription is bounded by OpenAI's 25 MB limit; readiness is judged against it. */
export const PREFLIGHT_MAX_BYTES = 25 * 1024 * 1024;
/** Cap how many calls one preflight request may probe. */
export const PREFLIGHT_MAX_BATCH = 200;

export type RecordingReadiness =
  | "ready"
  | "already_materialized"
  | "no_media"
  | "too_large"
  | "not_audio"
  | "expired_or_forbidden"
  | "unreachable"
  | "not_found";

export interface RecordingReadinessResult {
  callId: string;
  status: RecordingReadiness;
}

const EMPTY_BYTES = new Uint8Array();
const FORBIDDEN_STATUSES = new Set([401, 403, 404, 410]);
const DEFAULT_PROBE_TIMEOUT_MS = 15_000;
const SNIFF_BYTES = 64 * 1024;

function urlPathOf(urlText: string): string {
  try {
    return new URL(urlText).pathname;
  } catch {
    return "";
  }
}

/** Total object size from a ranged/full response, or null if unknown. */
function totalSizeFromHeaders(response: Response): number | null {
  const contentRange = response.headers.get("content-range");
  if (contentRange && contentRange.toLowerCase().startsWith("bytes ")) {
    const total = contentRange.split("/").at(-1)?.trim();
    if (total && total !== "*") {
      const parsed = Number(total);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function cancelBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // already closed
  }
}

interface RedirectedResponse {
  response: Response;
  /** The final URL after all redirects — its path is the authoritative source
   *  for an extension-based audio sniff (Ringba redirects to an S3 key whose
   *  path differs from the original recording URL). */
  finalUrl: string;
}

/** Issue a request, following redirects manually and re-validating each hop. */
async function requestWithRedirects(
  method: "HEAD" | "GET",
  urlText: string,
  extraHeaders: Record<string, string>,
  timeoutMs: number
): Promise<RedirectedResponse> {
  let current = assertSafeRecordingUrl(urlText);
  let redirectCount = 0;
  for (;;) {
    // Reject a public host that resolves to a private IP, on every hop.
    await assertHostResolvesToPublic(current.hostname);
    const response = await fetch(current.toString(), {
      method,
      headers: extraHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await cancelBody(response);
      if (!location) return { response, finalUrl: current.toString() };
      redirectCount += 1;
      if (redirectCount > 5) {
        throw new Error("Too many redirects.");
      }
      current = assertSafeRecordingUrl(new URL(location, current).toString());
      continue;
    }
    return { response, finalUrl: current.toString() };
  }
}

async function readUpTo(response: Response, maxBytes: number): Promise<Uint8Array> {
  const body = response.body;
  if (!body) return EMPTY_BYTES;
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // already closed
    }
  }
  return Buffer.concat(chunks, total);
}

/**
 * Probe a recording URL without downloading it whole: a HEAD fast-path, then a
 * ranged GET (authoritative — and the path that works for S3 presigned-GET URLs,
 * where HEAD often 403s). Classifies readiness for transcription.
 */
export async function probeRecordingReadiness(
  urlText: string,
  options: { maxBytes: number; timeoutMs?: number }
): Promise<RecordingReadiness> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  // HEAD fast-path: only trusted when it gives a confident answer; a 4xx HEAD
  // (common for S3 presigned-GET URLs) is ignored in favor of the ranged GET.
  try {
    const { response: head, finalUrl } = await requestWithRedirects("HEAD", urlText, {}, timeoutMs);
    await cancelBody(head);
    if (head.ok) {
      const total = totalSizeFromHeaders(head);
      if (total != null && total > options.maxBytes) return "too_large";
      const contentType = head.headers.get("content-type") ?? "";
      // Extension fallback uses the FINAL (post-redirect) URL path, not the
      // original — the original may carry no audio hint while the redirect
      // target does.
      if (contentType && detectAudioExtension(EMPTY_BYTES, contentType, urlPathOf(finalUrl))) {
        return "ready";
      }
    }
  } catch {
    // ignore — fall through to the ranged GET
  }

  let ranged: RedirectedResponse;
  try {
    ranged = await requestWithRedirects("GET", urlText, { Range: `bytes=0-${SNIFF_BYTES - 1}` }, timeoutMs);
  } catch {
    // network error, timeout, or a blocked (SSRF) redirect target
    return "unreachable";
  }

  if (FORBIDDEN_STATUSES.has(ranged.response.status)) {
    await cancelBody(ranged.response);
    return "expired_or_forbidden";
  }
  if (ranged.response.status !== 200 && ranged.response.status !== 206) {
    await cancelBody(ranged.response);
    return "unreachable";
  }

  const total = totalSizeFromHeaders(ranged.response);
  if (total != null && total > options.maxBytes) {
    await cancelBody(ranged.response);
    return "too_large";
  }

  const sniff = await readUpTo(ranged.response, SNIFF_BYTES);
  const contentType = ranged.response.headers.get("content-type") ?? "";
  return detectAudioExtension(sniff, contentType, urlPathOf(ranged.finalUrl)) ? "ready" : "not_audio";
}

/**
 * Report per-call recording readiness for a batch of call ids, scoped to the
 * org. Calls already materialized into storage skip the network probe. The
 * `probe` dependency is injectable for tests.
 */
export async function verifyRecordings(
  client: SupabaseAny,
  options: {
    organizationId: string;
    callIds: string[];
    maxBytes?: number;
    probe?: (url: string, opts: { maxBytes: number }) => Promise<RecordingReadiness>;
  }
): Promise<RecordingReadinessResult[]> {
  const maxBytes = options.maxBytes ?? PREFLIGHT_MAX_BYTES;
  const probe = options.probe ?? ((url, opts) => probeRecordingReadiness(url, opts));

  const requestedIds = Array.from(new Set(options.callIds.filter((id) => id.length > 0)));
  if (requestedIds.length === 0) {
    return [];
  }

  const callRows = await client
    .from("calls")
    .select("id, recording_storage_path, recording_url")
    .eq("organization_id", options.organizationId)
    .in("id", requestedIds);

  if (callRows.error) {
    throw new Error(callRows.error.message);
  }

  const byId = new Map<string, { storagePath: string; recordingUrl: string }>();
  for (const row of callRows.data ?? []) {
    const record = row as Record<string, unknown>;
    byId.set(String(record.id), {
      storagePath: typeof record.recording_storage_path === "string" ? record.recording_storage_path.trim() : "",
      recordingUrl: typeof record.recording_url === "string" ? record.recording_url.trim() : "",
    });
  }

  const results: RecordingReadinessResult[] = [];
  for (const callId of requestedIds) {
    const call = byId.get(callId);
    if (!call) {
      results.push({ callId, status: "not_found" });
      continue;
    }
    if (call.storagePath) {
      results.push({ callId, status: "already_materialized" });
      continue;
    }
    if (!call.recordingUrl) {
      results.push({ callId, status: "no_media" });
      continue;
    }
    const status = await probe(call.recordingUrl, { maxBytes });
    results.push({ callId, status });
  }

  return results;
}
