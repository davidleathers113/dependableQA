import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";
import { ingestIntegrationCalls, type IntegrationContext } from "./integration-ingest";
import {
  TRACKDRIVE_CALLS_DEFAULT_PER_PAGE,
  TRACKDRIVE_CALLS_START_CURSOR,
  fetchTrackDriveCallsPage,
  mapTrackDriveCallToNormalized,
  type TrackDriveFetch,
} from "./trackdrive-calls";

type SupabaseAny = SupabaseClient<Database>;

/**
 * Bounded, metadata-only TrackDrive API import. Server-only and isolated — no
 * route/UI/scheduler imports it yet. It loops `fetchTrackDriveCallsPage` over the
 * cursor flow, maps each call with `mapTrackDriveCallToNormalized`, and ingests via
 * `ingestIntegrationCalls` with `enqueueAiJobs: false`, so it can never queue AI or
 * surprise-spend. Hard page/record caps keep a historical backfill bounded even if
 * a caller passes huge values. Credentials are never logged or returned.
 */

/** Bound HTTP requests for one import (mirrors the Ringba manual-import cap). */
export const TRACKDRIVE_IMPORT_MAX_PAGES = 40;
/** Hard cap on calls ingested per import, enforced even if the caller asks for more. */
export const TRACKDRIVE_IMPORT_MAX_RECORDS = 2000;

export type TrackDriveImportStoppedReason =
  | "cursor_exhausted"
  | "empty_page"
  | "max_pages"
  | "max_records";

export interface TrackDriveImportSummary {
  fetched: number;
  accepted: number;
  skipped: number;
  pagesFetched: number;
  stoppedReason: TrackDriveImportStoppedReason;
  /** The cursor the last page reported (null once paging is exhausted). */
  nextCursor: string | null;
  ingestedCount: number;
  rejectedCount: number;
  recordingCount: number;
}

export interface TrackDriveImportOptions {
  client: SupabaseAny;
  integration: IntegrationContext;
  subdomain: string;
  publicKey: string;
  privateKey: string;
  perPage?: number;
  createdAtFromIso?: string;
  createdAtToIso?: string;
  columns?: string[];
  minimumDurationSeconds?: number;
  requireRecording?: boolean;
  maxPages?: number;
  maxRecords?: number;
  /** Injected fetch (forwarded to fetchTrackDriveCallsPage) — keeps this testable. */
  fetchImpl?: TrackDriveFetch;
  /** Injected ingest, defaulting to the real metadata-only ingest path. */
  ingestImpl?: typeof ingestIntegrationCalls;
}

export interface TrackDriveConnectionTestOptions {
  subdomain: string;
  publicKey: string;
  privateKey: string;
  fetchImpl?: TrackDriveFetch;
}

export interface TrackDriveConnectionTestResult {
  ok: boolean;
  sampleCount: number;
  error?: string;
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

/**
 * Verify TrackDrive credentials by fetching a single JSON call sample. This does
 * not import, record an event, queue AI, or expose credentials; callers can wire
 * it into a settings/API route later once credential storage is finalized.
 */
export async function testTrackDriveConnection(
  options: TrackDriveConnectionTestOptions
): Promise<TrackDriveConnectionTestResult> {
  try {
    const page = await fetchTrackDriveCallsPage({
      subdomain: options.subdomain,
      publicKey: options.publicKey,
      privateKey: options.privateKey,
      cursor: TRACKDRIVE_CALLS_START_CURSOR,
      perPage: 1,
      columns: ["uuid", "caller_number", "created_at", "recording_url"],
      fetchImpl: options.fetchImpl,
    });
    return { ok: true, sampleCount: page.calls.length };
  } catch (error) {
    return {
      ok: false,
      sampleCount: 0,
      error: error instanceof Error ? error.message : "TrackDrive connection test failed.",
    };
  }
}

export async function importTrackDriveCallsMetadata(
  options: TrackDriveImportOptions
): Promise<TrackDriveImportSummary> {
  const maxPages = Math.min(
    clampPositive(options.maxPages, TRACKDRIVE_IMPORT_MAX_PAGES),
    TRACKDRIVE_IMPORT_MAX_PAGES
  );
  const maxRecords = Math.min(
    clampPositive(options.maxRecords, TRACKDRIVE_IMPORT_MAX_RECORDS),
    TRACKDRIVE_IMPORT_MAX_RECORDS
  );
  // Don't request more per page than we're allowed to keep.
  const perPage = Math.min(clampPositive(options.perPage, TRACKDRIVE_CALLS_DEFAULT_PER_PAGE), maxRecords);
  const ingest = options.ingestImpl ?? ingestIntegrationCalls;

  const normalizedCalls: Array<Record<string, unknown>> = [];
  let fetched = 0;
  let skipped = 0;
  let pagesFetched = 0;
  let cursor: string | number = TRACKDRIVE_CALLS_START_CURSOR;
  let nextCursor: string | null = null;
  let stoppedReason: TrackDriveImportStoppedReason = "cursor_exhausted";

  while (true) {
    if (pagesFetched >= maxPages) {
      stoppedReason = "max_pages";
      break;
    }

    const page = await fetchTrackDriveCallsPage({
      subdomain: options.subdomain,
      publicKey: options.publicKey,
      privateKey: options.privateKey,
      cursor,
      perPage,
      createdAtFromIso: options.createdAtFromIso,
      createdAtToIso: options.createdAtToIso,
      columns: options.columns,
      fetchImpl: options.fetchImpl,
    });
    pagesFetched += 1;
    nextCursor = page.nextCursor;

    if (page.calls.length === 0) {
      stoppedReason = "empty_page";
      break;
    }

    fetched += page.calls.length;

    let reachedRecordCap = false;
    for (const call of page.calls) {
      const mapped = mapTrackDriveCallToNormalized(call, {
        minimumDurationSeconds: options.minimumDurationSeconds,
        requireRecording: options.requireRecording,
      });
      if (!mapped) {
        skipped += 1;
        continue;
      }
      normalizedCalls.push(mapped as unknown as Record<string, unknown>);
      if (normalizedCalls.length >= maxRecords) {
        reachedRecordCap = true;
        break;
      }
    }

    if (reachedRecordCap) {
      stoppedReason = "max_records";
      break;
    }
    if (page.nextCursor === null) {
      stoppedReason = "cursor_exhausted";
      break;
    }
    cursor = page.nextCursor;
  }

  let ingestedCount = 0;
  let rejectedCount = 0;
  let recordingCount = 0;

  if (normalizedCalls.length > 0) {
    const payload: Record<string, unknown> = {
      provider: "trackdrive",
      platform: "trackdrive",
      ingestionMode: "api",
      eventType: "trackdrive.api.import",
    };
    // Cost control: enqueueAiJobs:false guarantees metadata-only — no transcription
    // or analysis is queued even when calls carry recording URLs.
    const result = await ingest(options.client, options.integration, payload, normalizedCalls, {
      enqueueAiJobs: false,
    });
    ingestedCount = result.ingestedCount;
    rejectedCount = result.rejectedCount;
    recordingCount = result.recordingCount;
  }

  return {
    fetched,
    accepted: normalizedCalls.length,
    skipped,
    pagesFetched,
    stoppedReason,
    nextCursor,
    ingestedCount,
    rejectedCount,
    recordingCount,
  };
}
