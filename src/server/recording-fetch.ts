import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Shared, hardened recording fetcher used by transcription (and, later, by
 * playback materialization and the readiness preflight). It exists because a
 * call recording URL is attacker-influenced on some paths (the Ringba pixel
 * accepts `recording_url` from the query string) and points at third-party hosts
 * (Ringba 302-redirects to S3). Every fetch therefore:
 *
 *   - follows redirects MANUALLY and re-validates every hop (no SSRF via a
 *     Location header that points at a private/loopback host),
 *   - enforces a byte cap from the Content-Length header AND while streaming
 *     (never buffers an unbounded body into memory),
 *   - resolves the audio format from magic bytes -> content-type -> URL path,
 *     and refuses anything it cannot identify (never emits a bogus ".audio"),
 *   - marks 4xx as non-retryable so a dead/expired link fails fast instead of
 *     burning the job's retry budget.
 *
 * It never logs the URL, its query string, or any Authorization header — those
 * can carry signed credentials.
 */

export const DEFAULT_RECORDING_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_REDIRECTS = 5;

/** OpenAI-accepted audio extensions we are willing to produce. */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

type NonRetryableError = Error & { retryable?: boolean };

export function createNonRetryableError(message: string): NonRetryableError {
  const error = new Error(message) as NonRetryableError;
  error.retryable = false;
  return error;
}

// ---- SSRF host validation -------------------------------------------------

function isBlockedIpv4Host(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return parts[0] === 192 && parts[1] === 168;
}

function isBlockedIpv6Host(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "::1") return true;
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

/**
 * True if `ip` is an IP literal in a private, loopback, link-local, or
 * unspecified range we refuse to connect to. Returns false for non-IP strings
 * (callers resolve hostnames separately) — see `assertHostResolvesToPublic`.
 */
export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4Host(ip);
  if (version === 6) return isBlockedIpv6Host(ip);
  return false;
}

/**
 * Defend against SSRF via DNS: a *public* hostname (which passes the literal
 * checks in `assertSafeRecordingUrl`) can still resolve to a private/loopback
 * IP. Resolve the host and reject if ANY returned address is blocked.
 *
 * This validates before we connect; it does not fully close the DNS-rebinding
 * TOCTOU window (the kernel may re-resolve at connect time). Connect-time IP
 * pinning (a custom undici dispatcher) would, and is tracked as future
 * hardening — this resolve-and-validate guard is the baseline for the current
 * Ringba/S3 threat model. A lookup failure is left to the subsequent fetch to
 * surface as a (retryable) network error.
 */
export async function assertHostResolvesToPublic(hostname: string): Promise<void> {
  // IP literals were already validated by `assertSafeRecordingUrl`.
  if (isIP(hostname)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return;
  }
  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw createNonRetryableError("Recording URL host resolves to a private or loopback address.");
    }
  }
}

export function assertSafeRecordingUrl(urlText: string): URL {
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

  if (isBlockedIpAddress(hostname)) {
    throw createNonRetryableError("Recording URL must not target a private or loopback host.");
  }

  return parsedUrl;
}

// ---- format detection -----------------------------------------------------

function bytesStartWithAscii(buf: Uint8Array, offset: number, ascii: string) {
  if (buf.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (buf[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/** Identify an audio format from its leading bytes. Returns an extension or null. */
function extensionFromMagicBytes(buf: Uint8Array): string | null {
  if (buf.length >= 12 && bytesStartWithAscii(buf, 0, "RIFF") && bytesStartWithAscii(buf, 8, "WAVE")) {
    return ".wav";
  }
  if (bytesStartWithAscii(buf, 0, "ID3")) return ".mp3";
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return ".mp3"; // MPEG frame sync
  if (buf.length >= 12 && bytesStartWithAscii(buf, 4, "ftyp")) {
    return bytesStartWithAscii(buf, 8, "M4A ") ? ".m4a" : ".mp4";
  }
  if (bytesStartWithAscii(buf, 0, "OggS")) return ".ogg";
  if (bytesStartWithAscii(buf, 0, "fLaC")) return ".flac";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return ".webm";
  }
  return null;
}

function extensionFromContentType(contentType: string): string | null {
  const type = contentType.trim().toLowerCase();
  if (!type) return null;
  if (type.includes("mpeg") || type.includes("mp3") || type.includes("mpga")) return ".mp3";
  if (type.includes("wav") || type.includes("wave")) return ".wav";
  if (type.includes("m4a")) return ".m4a";
  if (type.includes("mp4")) return ".mp4";
  if (type.includes("webm")) return ".webm";
  if (type.includes("flac")) return ".flac";
  if (type.includes("ogg")) return ".ogg";
  return null;
}

function extensionFromPath(pathName: string): string | null {
  const lower = pathName.trim().toLowerCase();
  for (const extension of Object.keys(MIME_BY_EXTENSION)) {
    if (lower.endsWith(extension)) return extension;
  }
  if (lower.endsWith(".mpeg") || lower.endsWith(".mpga")) return ".mp3";
  if (lower.endsWith(".oga")) return ".ogg";
  return null;
}

/**
 * Best-effort audio-format detection, trusting magic bytes first (the only
 * signal that survives a mislabeled S3 object), then the content-type header,
 * then the URL path. Returns null when the format cannot be identified — callers
 * that must have a format use `resolveAudioExtension`; the preflight uses this to
 * classify `not_audio` without throwing.
 */
export function detectAudioExtension(
  bytes: Uint8Array,
  contentType: string,
  finalUrlPath: string
): string | null {
  return (
    extensionFromMagicBytes(bytes) ??
    extensionFromContentType(contentType) ??
    extensionFromPath(finalUrlPath) ??
    null
  );
}

/**
 * Resolve a supported audio extension. Throws — never returns a placeholder —
 * when the format cannot be identified, so OpenAI is never handed an unusable
 * file.
 */
export function resolveAudioExtension(bytes: Uint8Array, contentType: string, finalUrlPath: string): string {
  const detected = detectAudioExtension(bytes, contentType, finalUrlPath);
  if (!detected) {
    throw createNonRetryableError(
      "Could not determine a supported audio format for the recording (no magic-byte, content-type, or filename signal)."
    );
  }
  return detected;
}

export function mimeForExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

// ---- the guarded fetch ----------------------------------------------------

export interface FetchRecordingOptions {
  /** Hard byte cap. Enforced via Content-Length and while streaming. */
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * Optional auth, sent ONLY on the first request and ONLY when the host is
   * authorized — never forwarded across a redirect (which could leak it to a
   * CDN/S3 host). Ringba's public recording URLs do not need this (proven by
   * scripts/ringba-recording-smoke.mjs); it exists for providers that do.
   */
  auth?: { token: string; hostIsAuthorized: (hostname: string) => boolean };
}

export interface FetchedRecording {
  bytes: Buffer;
  /** A clean audio mime derived from the resolved (magic-verified) extension. */
  contentType: string;
  extension: string;
  /** Final URL after redirects. Sensitive (may contain signed tokens) — do not log. */
  finalUrl: string;
}

function sizeError(maxBytes: number): NonRetryableError {
  const mb = Math.floor(maxBytes / (1024 * 1024));
  return createNonRetryableError(`Recording exceeds the maximum allowed size of ${mb} MB.`);
}

async function cancelBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Body already consumed/closed — nothing to do.
  }
}

async function readBodyWithCap(response: Response, maxBytes: number): Promise<Buffer> {
  const body = response.body;
  if (!body) return Buffer.alloc(0);

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        throw sizeError(maxBytes);
      }
      chunks.push(chunk);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader already closed.
    }
  }
  return Buffer.concat(chunks, total);
}

export async function fetchRecordingWithGuards(
  urlText: string,
  options: FetchRecordingOptions
): Promise<FetchedRecording> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_RECORDING_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let current = assertSafeRecordingUrl(urlText);
  let redirectCount = 0;
  let response: Response;

  for (;;) {
    // Re-resolve and re-validate the host on every hop (initial + each redirect)
    // so a public hostname that resolves to a private IP is rejected.
    await assertHostResolvesToPublic(current.hostname);

    const headers: Record<string, string> = {};
    if (
      options.auth &&
      redirectCount === 0 &&
      options.auth.hostIsAuthorized(current.hostname.trim().toLowerCase())
    ) {
      headers.Authorization = `Token ${options.auth.token}`;
    }

    try {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Network failure or timeout — transient, so retryable (default Error).
      throw new Error("Unable to reach the recording host (network error or timeout).");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await cancelBody(response);
      if (!location) break; // 3xx without a Location — treat as terminal.
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        throw createNonRetryableError(`Recording URL exceeded the maximum of ${maxRedirects} redirects.`);
      }
      current = assertSafeRecordingUrl(new URL(location, current).toString());
      continue;
    }
    break;
  }

  if (!response.ok) {
    await cancelBody(response);
    const message = `Unable to fetch recording. Upstream returned ${response.status}.`;
    // A bad request, auth failure, missing or gone resource won't fix itself.
    if ([400, 401, 403, 404, 410].includes(response.status)) {
      throw createNonRetryableError(message);
    }
    throw new Error(message); // 5xx and other statuses are retryable.
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const declared = Number(declaredLength);
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      await cancelBody(response);
      throw sizeError(options.maxBytes);
    }
  }

  const bytes = await readBodyWithCap(response, options.maxBytes);
  const rawContentType = response.headers.get("content-type")?.trim() ?? "";
  const extension = resolveAudioExtension(bytes, rawContentType, current.pathname);

  return {
    bytes,
    contentType: mimeForExtension(extension),
    extension,
    finalUrl: current.toString(),
  };
}
