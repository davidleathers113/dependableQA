/**
 * TrackDrive calls-API helper foundation — pure request-building + normalization,
 * no network calls and no live import route yet. Wiring an actual fetch/ingest
 * path comes later; this layer exists so that logic is tested first.
 *
 * Verified against the official TrackDrive calls API docs
 * (GET https://[subdomain].trackdrive.com/api/v1/calls, HTTP Basic auth, cursor
 * pagination via cursor=-1 → metadata.next_cursor until 0). Query-param names for
 * filtering (date range, columns) follow the documented convention but should be
 * re-confirmed against the target account's API docs before the live route ships.
 */

/** TrackDrive cursor pagination starts at -1 and ends when next_cursor is 0. */
export const TRACKDRIVE_CALLS_START_CURSOR = "-1";
export const TRACKDRIVE_CALLS_DEFAULT_PER_PAGE = 100;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
}

/** Validate a TrackDrive subdomain label without regex (prevents host injection). */
export function assertTrackDriveSubdomain(value: string): string {
  const subdomain = value.trim().toLowerCase();
  if (subdomain.length === 0) {
    throw new Error("TrackDrive subdomain is required.");
  }
  const allowed = "abcdefghijklmnopqrstuvwxyz0123456789-";
  for (const char of subdomain) {
    if (!allowed.includes(char)) {
      throw new Error("TrackDrive subdomain may only contain letters, numbers, and hyphens.");
    }
  }
  return subdomain;
}

export interface TrackDriveCallsUrlOptions {
  subdomain: string;
  /** Pagination cursor; defaults to the documented start value (-1). */
  cursor?: string | number;
  /** Page size → `per_page`. */
  perPage?: number;
  /** Inclusive lower bound on call creation time (ISO) → `created_at_from`. */
  createdAtFromIso?: string;
  /** Inclusive upper bound on call creation time (ISO) → `created_at_to`. */
  createdAtToIso?: string;
  /** Restrict returned columns → `columns` (comma-joined). */
  columns?: string[];
}

/** Build the TrackDrive calls endpoint URL using URL/URLSearchParams (no string concat). */
export function buildTrackDriveCallsUrl(options: TrackDriveCallsUrlOptions): string {
  const subdomain = assertTrackDriveSubdomain(options.subdomain);
  const url = new URL(`https://${subdomain}.trackdrive.com/api/v1/calls`);
  const params = url.searchParams;

  params.set("cursor", String(options.cursor ?? TRACKDRIVE_CALLS_START_CURSOR));
  if (options.perPage != null) {
    params.set("per_page", String(Math.max(1, Math.floor(options.perPage))));
  }
  if (options.createdAtFromIso) {
    params.set("created_at_from", options.createdAtFromIso);
  }
  if (options.createdAtToIso) {
    params.set("created_at_to", options.createdAtToIso);
  }
  if (options.columns && options.columns.length > 0) {
    params.set("columns", options.columns.join(","));
  }

  return url.toString();
}

/**
 * Deterministic HTTP Basic auth header from a TrackDrive public/private key pair.
 * Returns `Basic <base64(public:private)>`; never logs the inputs or output.
 */
export function buildTrackDriveBasicAuthHeader(publicKey: string, privateKey: string): string {
  const id = publicKey.trim();
  const secret = privateKey.trim();
  if (!id || !secret) {
    throw new Error("TrackDrive public and private keys are required.");
  }
  const token = Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/** Documented TrackDrive call fields we read (others are ignored, not invented). */
export interface TrackDriveCallPayload {
  uuid?: unknown;
  caller_number?: unknown;
  number_called?: unknown;
  created_at?: unknown;
  ended_at?: unknown;
  recording_url?: unknown;
  total_duration?: unknown;
  answered_duration?: unknown;
  traffic_source?: unknown;
  buyer?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

/**
 * Clearly-named intermediate shape, camelCase to match what `ingestIntegrationCalls`
 * already accepts. `recordingUrl` is present only when TrackDrive provided one, so a
 * call with no recording stays metadata-only downstream (no AI enqueue here).
 */
export interface NormalizedTrackDriveCall {
  externalCallId: string;
  callerNumber: string;
  durationSeconds: number;
  startedAt: string;
  destinationNumber?: string;
  publisherName?: string;
  recordingUrl?: string;
}

function parseTrackDriveTimestamp(value: unknown): string | null {
  const raw = asTrimmedString(value);
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Normalize one TrackDrive call into the app's import shape. Returns null when a
 * required field (uuid, caller_number, parseable created_at) is missing, when the
 * call is shorter than `minimumDurationSeconds`, or when `requireRecording` is set
 * but no recording_url exists. Only documented fields are mapped; nothing invented.
 */
export function mapTrackDriveCallToNormalized(
  call: TrackDriveCallPayload,
  options: { minimumDurationSeconds?: number; requireRecording?: boolean } = {}
): NormalizedTrackDriveCall | null {
  const requireRecording = options.requireRecording ?? false;
  const minimumDurationSeconds = options.minimumDurationSeconds ?? 0;

  const externalCallId = asTrimmedString(call.uuid);
  if (!externalCallId) {
    return null;
  }

  const callerNumber = asTrimmedString(call.caller_number);
  if (!callerNumber) {
    return null;
  }

  const startedAt = parseTrackDriveTimestamp(call.created_at);
  if (!startedAt) {
    return null;
  }

  const durationSeconds = asNonNegativeInt(call.total_duration);
  if (durationSeconds < minimumDurationSeconds) {
    return null;
  }

  const recordingUrl = asTrimmedString(call.recording_url);
  if (requireRecording && !recordingUrl) {
    return null;
  }

  const normalized: NormalizedTrackDriveCall = {
    externalCallId,
    callerNumber,
    durationSeconds,
    startedAt,
  };

  const destinationNumber = asTrimmedString(call.number_called);
  if (destinationNumber) {
    normalized.destinationNumber = destinationNumber;
  }
  // TrackDrive's traffic_source is the closest documented analogue to a publisher.
  const publisherName = asTrimmedString(call.traffic_source);
  if (publisherName) {
    normalized.publisherName = publisherName;
  }
  if (recordingUrl) {
    normalized.recordingUrl = recordingUrl;
  }

  return normalized;
}

/** Minimal response surface this module needs — lets tests inject a tiny fake. */
export interface TrackDriveFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Injected fetch shape; the global `fetch` is assignable to it. */
export type TrackDriveFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> }
) => Promise<TrackDriveFetchResponse>;

export interface TrackDriveCallsPageResult {
  calls: TrackDriveCallPayload[];
  nextCursor: string | null;
}

function asCallArray(value: unknown): TrackDriveCallPayload[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is TrackDriveCallPayload => Boolean(entry) && typeof entry === "object")
    : [];
}

/** Accept the wrapped `{ calls: [...] }` shape or a bare array (TrackDrive `root=false`). */
function extractTrackDriveCalls(parsed: unknown): TrackDriveCallPayload[] | null {
  if (Array.isArray(parsed)) {
    return asCallArray(parsed);
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).calls)) {
    return asCallArray((parsed as Record<string, unknown>).calls);
  }
  return null;
}

/**
 * Fetch one page of TrackDrive calls (JSON only) using an injected fetch — no live
 * route, scheduler, or global-fetch dependency. Builds the URL + Basic auth header
 * from the existing helpers, parses the wrapped or bare-array shape conservatively,
 * and returns `{ calls, nextCursor }` (via `nextTrackDriveCursor`). Errors carry
 * HTTP/provider context only — never the keys or the Authorization value.
 */
export async function fetchTrackDriveCallsPage(options: {
  subdomain: string;
  publicKey: string;
  privateKey: string;
  cursor?: string | number;
  perPage?: number;
  createdAtFromIso?: string;
  createdAtToIso?: string;
  columns?: string[];
  fetchImpl?: TrackDriveFetch;
}): Promise<TrackDriveCallsPageResult> {
  const doFetch = options.fetchImpl ?? (fetch as unknown as TrackDriveFetch);
  const url = buildTrackDriveCallsUrl({
    subdomain: options.subdomain,
    cursor: options.cursor,
    perPage: options.perPage,
    createdAtFromIso: options.createdAtFromIso,
    createdAtToIso: options.createdAtToIso,
    columns: options.columns,
  });
  const authorization = buildTrackDriveBasicAuthHeader(options.publicKey, options.privateKey);

  let response: TrackDriveFetchResponse;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
    });
  } catch (error) {
    throw new Error(
      `TrackDrive calls request failed: ${error instanceof Error ? error.message : "network error"}`
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`TrackDrive calls request failed (HTTP ${response.status}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`TrackDrive calls response was not JSON (HTTP ${response.status}).`);
  }

  const calls = extractTrackDriveCalls(parsed);
  if (calls === null) {
    throw new Error(`TrackDrive calls response had an unexpected shape (HTTP ${response.status}).`);
  }

  const metadata = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).metadata : undefined;
  return { calls, nextCursor: nextTrackDriveCursor(metadata) };
}

/** TrackDrive pagination metadata block (only `next_cursor` is read). */
export interface TrackDriveResponseMetadata {
  next_cursor?: unknown;
}

/**
 * The next pagination cursor, or null when paging should stop. TrackDrive signals
 * "no more pages" with next_cursor === 0; we also stop on null/undefined/empty.
 */
export function nextTrackDriveCursor(metadata: unknown): string | null {
  const record = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
  const raw = record?.next_cursor;
  if (raw === null || raw === undefined) {
    return null;
  }
  const value = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (value === "" || value === "0") {
    return null;
  }
  return value;
}
