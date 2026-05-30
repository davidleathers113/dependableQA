#!/usr/bin/env node
// Ringba recording fetchability smoke test (Phase 0).
//
// Answers the core unknown for the Ringba -> transcription pipeline: can a real
// Ringba `recordingUrl` be fetched from a server WITHOUT auth, or does it need
// `Authorization: Token <ringba-api-token>`? The answer decides whether the
// shared recording fetcher (src/server/recording-fetch.ts) must inject Ringba
// auth on recording downloads.
//
// Safety: this is a read-only diagnostic. It never writes to the database, never
// uploads to storage, and never contacts production app surfaces. It also never
// logs the recording URL, its query string, the API token, or the Authorization
// header — those can carry signed credentials. Only sanitized facts are printed.
//
// Usage:
//   RINGBA_RECORDING_URL='https://media.ringba.com/...' npm run ringba:smoke-recording
//   RINGBA_RECORDING_URL='...' RINGBA_API_TOKEN='...' npm run ringba:smoke-recording
//
// Exit codes: 0 always for a completed probe (even a 403/404 is a *result*, not a
// failure); non-zero only for script/runtime errors (missing input, invalid URL,
// network exception, redirect-limit/abort).

import { isIP } from "node:net";

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
const SNIFF_BYTES = 16;

// ---- SSRF-style host validation (no regex; mirrors transcribe-call's guard) ----

function isBlockedIpv4Host(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return parts[0] === 192 && parts[1] === 168;
}

function isBlockedIpv6Host(hostname) {
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

function assertSafeUrl(urlText) {
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    throw new Error("Recording URL is invalid.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Recording URL must use http or https.");
  }
  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    throw new Error("Recording URL hostname is required.");
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Recording URL hostname is not allowed.");
  }
  const ipVersion = isIP(hostname);
  if (
    (ipVersion === 4 && isBlockedIpv4Host(hostname)) ||
    (ipVersion === 6 && isBlockedIpv6Host(hostname))
  ) {
    throw new Error("Recording URL must not target a private or loopback host.");
  }
  return parsed;
}

function isRingbaHost(hostname) {
  const host = hostname.trim().toLowerCase();
  return host === "ringba.com" || host.endsWith(".ringba.com");
}

// ---- audio format detection by magic bytes (no regex) ----

function bytesStartWithAscii(buf, offset, ascii) {
  if (buf.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (buf[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

function detectAudioFormat(buf) {
  if (buf.length >= 12 && bytesStartWithAscii(buf, 0, "RIFF") && bytesStartWithAscii(buf, 8, "WAVE")) {
    return "wav";
  }
  if (bytesStartWithAscii(buf, 0, "ID3")) return "mp3";
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3"; // MPEG frame sync
  if (buf.length >= 8 && bytesStartWithAscii(buf, 4, "ftyp")) return "mp4/m4a";
  if (bytesStartWithAscii(buf, 0, "OggS")) return "ogg";
  if (bytesStartWithAscii(buf, 0, "fLaC")) return "flac";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "webm/matroska";
  }
  return "unknown";
}

// ---- the probe ----

async function probeRecording(urlText, { sendAuth, token }) {
  let current = assertSafeUrl(urlText);
  const initialHost = current.hostname;
  const hops = [];
  let redirectCount = 0;
  let response;

  for (;;) {
    const headers = {};
    // Send Ringba auth ONLY on the first request and ONLY to a verified Ringba
    // host. Never forward it across a redirect (could leak to a CDN/S3 host).
    if (sendAuth && token && redirectCount === 0 && isRingbaHost(current.hostname)) {
      headers.Authorization = `Token ${token}`;
    }

    response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    hops.push({ host: current.hostname, status: response.status });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      try {
        await response.body?.cancel?.();
      } catch {
        // ignore — we only needed the headers
      }
      if (!location) break; // 3xx without Location: treat as terminal
      redirectCount += 1;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Exceeded ${MAX_REDIRECTS} redirects.`);
      }
      current = assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    break;
  }

  // Read only the first SNIFF_BYTES — never buffer the whole audio body.
  let firstBytes = Buffer.alloc(0);
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      total += chunk.length;
    }
    try {
      await reader.cancel();
    } catch {
      // ignore — we have what we need
    }
    firstBytes = Buffer.concat(chunks).subarray(0, SNIFF_BYTES);
  }

  return {
    ok: response.ok,
    status: response.status,
    initialHost,
    finalHost: current.hostname,
    redirectCount,
    redirectHosts: hops.map((h) => h.host),
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    first16BytesHex: firstBytes.toString("hex"),
    detectedFormat: detectAudioFormat(firstBytes),
  };
}

function summarizeAuthDifference(noAuth, withAuth) {
  if (!withAuth) return "n/a (no RINGBA_API_TOKEN provided)";
  if (noAuth.ok && withAuth.ok) return "no — both succeeded (token NOT required)";
  if (!noAuth.ok && withAuth.ok) return "YES — token REQUIRED (no-auth failed, token succeeded)";
  if (noAuth.ok && !withAuth.ok) return "token made it worse (no-auth succeeded, token failed)";
  return "neither succeeded — URL may be expired or invalid";
}

function decision(noAuth, withAuth) {
  if (noAuth.ok) {
    return "Phase 1: NO Ringba token injection needed — the recording URL fetches anonymously.";
  }
  if (withAuth?.ok) {
    return "Phase 1: INJECT `Authorization: Token` for Ringba recording hosts — anonymous fetch failed but token worked.";
  }
  return "Inconclusive: anonymous fetch failed and no working token path was proven. Re-run with a fresh URL (and token).";
}

async function main() {
  const url = process.env.RINGBA_RECORDING_URL;
  const token = process.env.RINGBA_API_TOKEN || null;
  if (!url) {
    console.error("RINGBA_RECORDING_URL is required. (Optional: RINGBA_API_TOKEN.)");
    process.exit(2);
  }

  const noAuth = await probeRecording(url, { sendAuth: false, token: null });
  const withAuth = token ? await probeRecording(url, { sendAuth: true, token }) : null;

  const report = {
    noAuth,
    withAuth,
    authMadeADifference: summarizeAuthDifference(noAuth, withAuth),
    decision: decision(noAuth, withAuth),
  };

  console.log("\n=== Ringba recording smoke test (sanitized — no URLs/tokens logged) ===\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nDecision gate: ${report.decision}\n`);
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
