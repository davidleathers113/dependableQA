import { DateTime } from "luxon";

const RINGBA_CALLLOGS_URL = "https://api.ringba.com/v2";

export const RINGBA_CALLLOG_PAGE_SIZE = 200;
/** Limit Ringba HTTP requests per scheduled run (rate limits). */
export const RINGBA_CALLLOG_MAX_PAGES = 10;
/** Cap ingested calls per sync to protect DB and job queue. */
export const RINGBA_MAX_RECORDING_CALLS_PER_SYNC = 500;

/**
 * Hard server-side cap on a single manual full-API import. Enforced even if the
 * UI is bypassed, so a historical backfill can never enqueue unbounded work.
 */
export const RINGBA_MANUAL_IMPORT_MAX_RECORDS = 2000;
/** Bound Ringba HTTP requests for one manual import (recording-only filtering can
 * make yield-per-page low, so this is higher than the scheduled-run page cap). */
export const RINGBA_MANUAL_IMPORT_MAX_PAGES = 40;

export interface RingbaCallLogRow {
  inboundCallId?: unknown;
  number?: unknown;
  inboundPhoneNumber?: unknown;
  callLengthInSeconds?: unknown;
  recordingUrl?: unknown;
  hasRecording?: unknown;
  campaignName?: unknown;
  publisherName?: unknown;
  callDt?: unknown;
  [key: string]: unknown;
}

export interface RingbaCallLogsReport {
  records?: RingbaCallLogRow[];
}

export interface RingbaCallLogsResponse {
  isSuccessful?: boolean;
  message?: string;
  report?: RingbaCallLogsReport;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Ringba returns localized date/time when formatDateTime is true; parse in the same IANA zone used for the report.
 */
export function parseRingbaCallDtToIso(callDt: unknown, timeZone: string): string | null {
  const raw = asTrimmedString(callDt);
  if (!raw) {
    return null;
  }

  const zone = timeZone.trim() || "UTC";
  const formats = ["MM/dd/yyyy h:mm:ss a", "M/d/yyyy h:mm:ss a", "MM/dd/yyyy HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss"];

  for (const fmt of formats) {
    const parsed = DateTime.fromFormat(raw, fmt, { zone });
    if (parsed.isValid) {
      return parsed.toUTC().toISO();
    }
  }

  const fromIso = DateTime.fromISO(raw, { zone });
  if (fromIso.isValid) {
    return fromIso.toUTC().toISO();
  }

  const millis = Date.parse(raw);
  if (!Number.isNaN(millis)) {
    return new Date(millis).toISOString();
  }

  return null;
}

function toReportYmd(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildRingbaCallLogsReportRange(lookbackHours: number): { reportStart: string; reportEnd: string } {
  const safeHours = Math.max(1, Math.floor(lookbackHours));
  const endMs = Date.now();
  const startMs = endMs - safeHours * 60 * 60 * 1000;

  return {
    reportStart: toReportYmd(startMs),
    reportEnd: toReportYmd(endMs),
  };
}

/**
 * Build a Ringba report range (YMD) from an explicit start/end window, used by the
 * manual full-API import. Both inputs are ISO timestamps; the order is normalized so
 * an inverted range still produces a valid (start <= end) report window.
 */
export function buildRingbaReportRangeFromDates(
  dateStartIso: string,
  dateEndIso: string
): { reportStart: string; reportEnd: string } {
  const startMs = Date.parse(dateStartIso);
  const endMs = Date.parse(dateEndIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new Error("Ringba import date range must be valid ISO timestamps.");
  }
  const lo = Math.min(startMs, endMs);
  const hi = Math.max(startMs, endMs);
  return {
    reportStart: toReportYmd(lo),
    reportEnd: toReportYmd(hi),
  };
}

function rowHasRecording(row: RingbaCallLogRow): boolean {
  // A usable recording requires a non-empty URL (we transcribe the URL). The
  // `hasRecording` boolean is only a secondary signal: live Ringba call-logs
  // responses commonly OMIT it while still returning a recordingUrl, so we treat
  // a present URL as a recording unless `hasRecording` is *explicitly* false.
  const url = asTrimmedString(row.recordingUrl);
  if (url.length === 0) {
    return false;
  }
  return row.hasRecording !== false;
}

export function filterRecordingRows(rows: RingbaCallLogRow[]): RingbaCallLogRow[] {
  return rows.filter(rowHasRecording);
}

export function mapRingbaCallLogRowToNormalizedCall(
  row: RingbaCallLogRow,
  options: { timeZone: string; minimumDurationSeconds: number; requireRecording?: boolean }
): Record<string, unknown> | null {
  // Default to recording-only so the scheduled sync keeps its existing behavior;
  // the manual import passes requireRecording=false to also import calls with no
  // recording (metadata only — those will be marked missing_media downstream).
  const requireRecording = options.requireRecording ?? true;
  const hasRecording = rowHasRecording(row);
  if (requireRecording && !hasRecording) {
    return null;
  }

  const externalId = asTrimmedString(row.inboundCallId);
  if (!externalId) {
    return null;
  }

  const caller =
    asTrimmedString(row.number) || asTrimmedString(row.inboundPhoneNumber);
  if (!caller) {
    return null;
  }

  const durationRaw = row.callLengthInSeconds;
  const durationSeconds =
    typeof durationRaw === "number" && Number.isFinite(durationRaw)
      ? Math.max(0, Math.floor(durationRaw))
      : 0;

  if (durationSeconds < options.minimumDurationSeconds) {
    return null;
  }

  const startedAt = parseRingbaCallDtToIso(row.callDt, options.timeZone) ?? new Date().toISOString();

  const normalized: Record<string, unknown> = {
    externalCallId: externalId,
    callerNumber: caller,
    durationSeconds,
    campaignName: asTrimmedString(row.campaignName),
    startedAt,
    publisherName: asTrimmedString(row.publisherName),
  };

  if (hasRecording) {
    normalized.recordingUrl = asTrimmedString(row.recordingUrl);
  }

  return normalized;
}

export async function fetchRingbaCallLogsPage(options: {
  accountId: string;
  apiToken: string;
  reportStart: string;
  reportEnd: string;
  formatTimeZone: string;
  offset: number;
  size: number;
}): Promise<RingbaCallLogsResponse> {
  const url = `${RINGBA_CALLLOGS_URL}/${encodeURIComponent(options.accountId)}/calllogs`;
  const body = {
    reportStart: options.reportStart,
    reportEnd: options.reportEnd,
    offset: options.offset,
    size: options.size,
    formatDateTime: true,
    formatTimeZone: options.formatTimeZone,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${options.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: RingbaCallLogsResponse;
  try {
    parsed = JSON.parse(text) as RingbaCallLogsResponse;
  } catch {
    throw new Error(`Ringba call logs response was not JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const msg = asTrimmedString(parsed.message) || `HTTP ${response.status}`;
    throw new Error(`Ringba call logs request failed: ${msg}`);
  }

  if (parsed.isSuccessful === false) {
    const msg = asTrimmedString(parsed.message) || "Ringba reported isSuccessful=false.";
    throw new Error(msg);
  }

  return parsed;
}
