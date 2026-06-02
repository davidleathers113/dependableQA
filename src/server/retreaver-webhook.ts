/**
 * Retreaver webhook normalizer — pure, no route wiring yet. Retreaver campaign
 * webhooks deliver call data as HTTP request parameters (commonly URL params), so
 * this maps a single webhook payload (a plain object OR URLSearchParams) into the
 * app's camelCase import-call shape consumed by `ingestIntegrationCalls`.
 *
 * Only documented/common Retreaver token-style fields are read (see the alias
 * lists below); nothing unverified is invented. Verified against Retreaver's
 * official webhook + Core API docs (learn.retreaver.com/guides/webhooks,
 * retreaver.github.io/core-api-docs). No regex (project rule).
 */

export type RetreaverWebhookPayload = Record<string, unknown> | URLSearchParams;

/** Documented/common alias keys, in preference order, for each mapped dimension. */
const ALIASES = {
  externalCallId: ["call_uuid", "call_id", "uuid", "id"],
  callerNumber: ["caller_id", "caller_number", "caller", "phone_number"],
  destinationNumber: ["number_called", "destination_number", "dialed_number"],
  startedAt: ["started_at", "start_time", "created_at", "timestamp"],
  duration: ["duration", "duration_seconds", "total_duration", "call_duration"],
  recordingUrl: ["recording_url", "recording", "audio_url"],
  publisherName: ["publisher", "publisher_id", "affiliate", "affiliate_id", "source", "source_id"],
  buyerName: ["buyer", "buyer_id", "handler_id", "target", "target_id"],
  disposition: ["disposition", "status", "converted", "conversion_status"],
} as const;

/**
 * Intermediate shape: the ingest-compatible fields use the same camelCase keys
 * `ingestIntegrationCalls` already reads; `buyerName` is extra documented context
 * (Retreaver buyer/handler) that ingest currently ignores — kept for later wiring,
 * not invented as a stored column.
 */
export interface NormalizedRetreaverCall {
  externalCallId?: string;
  callerNumber: string;
  destinationNumber?: string;
  durationSeconds: number;
  startedAt: string;
  publisherName?: string;
  buyerName?: string;
  currentDisposition?: string;
  recordingUrl?: string;
}

function readValue(payload: RetreaverWebhookPayload, key: string): string {
  if (payload instanceof URLSearchParams) {
    const value = payload.get(key);
    return typeof value === "string" ? value.trim() : "";
  }
  const value = (payload as Record<string, unknown>)[key];
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function firstValue(payload: RetreaverWebhookPayload, keys: readonly string[]): string {
  for (const key of keys) {
    const value = readValue(payload, key);
    if (value) {
      return value;
    }
  }
  return "";
}

function isAllDigits(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const digits = "0123456789";
  for (const char of value) {
    if (!digits.includes(char)) {
      return false;
    }
  }
  return true;
}

function asNonNegativeInt(value: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

/** Parse an ISO string or a numeric epoch (10-digit seconds / 13-digit ms) to ISO, or null. */
function parseRetreaverTimestamp(raw: string): string | null {
  if (!raw) {
    return null;
  }
  if (isAllDigits(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    const ms = raw.length <= 10 ? numeric * 1000 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Normalize one Retreaver webhook payload. Returns null when the caller number is
 * missing or the started time is missing/unparseable (both required by the ingest
 * model). `recordingUrl` is set only when present, so a call with no recording
 * stays metadata-only downstream. No AI is enqueued here.
 */
export function normalizeRetreaverWebhookCall(
  payload: RetreaverWebhookPayload
): NormalizedRetreaverCall | null {
  const callerNumber = firstValue(payload, ALIASES.callerNumber);
  if (!callerNumber) {
    return null;
  }

  const startedAt = parseRetreaverTimestamp(firstValue(payload, ALIASES.startedAt));
  if (!startedAt) {
    return null;
  }

  const normalized: NormalizedRetreaverCall = {
    callerNumber,
    durationSeconds: asNonNegativeInt(firstValue(payload, ALIASES.duration)),
    startedAt,
  };

  const externalCallId = firstValue(payload, ALIASES.externalCallId);
  if (externalCallId) {
    normalized.externalCallId = externalCallId;
  }
  const destinationNumber = firstValue(payload, ALIASES.destinationNumber);
  if (destinationNumber) {
    normalized.destinationNumber = destinationNumber;
  }
  const publisherName = firstValue(payload, ALIASES.publisherName);
  if (publisherName) {
    normalized.publisherName = publisherName;
  }
  const buyerName = firstValue(payload, ALIASES.buyerName);
  if (buyerName) {
    normalized.buyerName = buyerName;
  }
  const disposition = firstValue(payload, ALIASES.disposition);
  if (disposition) {
    normalized.currentDisposition = disposition;
  }
  const recordingUrl = firstValue(payload, ALIASES.recordingUrl);
  if (recordingUrl) {
    normalized.recordingUrl = recordingUrl;
  }

  return normalized;
}
