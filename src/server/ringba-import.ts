import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, TablesInsert } from "../../supabase/types";
import { insertAuditLog } from "../lib/app-data";
import {
  getPublicIntegrationRingbaConfig,
  getRingbaApiAccessTokenFromConfig,
} from "../lib/integration-config";
import {
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  recordIntegrationEvent,
  type IntegrationContext,
} from "./integration-ingest";
import {
  buildRingbaCallLogsReportRange,
  buildRingbaReportRangeFromDates,
  fetchRingbaCallLogsPage,
  filterRecordingRows,
  mapRingbaCallLogRowToNormalizedCall,
  RINGBA_CALLLOG_PAGE_SIZE,
  RINGBA_MANUAL_IMPORT_MAX_PAGES,
  RINGBA_MANUAL_IMPORT_MAX_RECORDS,
  type RingbaCallLogRow,
} from "./ringba-calllogs";

type SupabaseAny = SupabaseClient<Database>;

export type RingbaImportBehavior = "import_only" | "review" | "analyze";

/** Raw manual-import request (typically the API body). Validated + clamped below. */
export const ringbaManualImportInputSchema = z.object({
  dateStartIso: z.string().min(1, "dateStart is required."),
  dateEndIso: z.string().min(1, "dateEnd is required."),
  maxRecords: z.coerce
    .number()
    .int()
    .positive("maxRecords must be a positive integer."),
  recordingOnly: z.boolean().optional().default(true),
  minimumDurationSeconds: z.coerce.number().int().nonnegative().optional(),
  importBehavior: z
    .enum(["import_only", "review", "analyze"])
    .optional()
    .default("import_only"),
});

export type RingbaManualImportInput = z.input<typeof ringbaManualImportInputSchema>;

export interface RingbaImportedCallSummary {
  callId: string;
  callerNumber: string;
  durationSeconds: number;
  hasRecording: boolean;
}

export interface RingbaManualImportResult {
  batchId: string;
  status: Database["public"]["Tables"]["ringba_import_batches"]["Row"]["status"];
  recordsSeen: number;
  recordsImported: number;
  recordingsImported: number;
  rejectedCount: number;
  callIds: string[];
  importedCalls: RingbaImportedCallSummary[];
  /** Whether the server clamped the requested maxRecords down to the hard cap. */
  capped: boolean;
  error?: string;
}

export interface RingbaConnectionTestResult {
  ok: boolean;
  sampleCount: number;
  error?: string;
}

/**
 * Optional credential overrides supplied by the settings form so a user can
 * test what they just typed BEFORE saving. A blank/absent token falls back to
 * the saved token (so an already-configured integration can be re-tested
 * without re-entering the secret).
 */
export interface RingbaConnectionTestOverrides {
  accountId?: string;
  apiToken?: string;
  timeZone?: string;
}

/**
 * Verify Ringba credentials by fetching a tiny (size 1) call-logs sample over a
 * short recent window. Does NOT import anything and records no integration event —
 * it is a pure connectivity/credential check for the settings UI.
 */
export async function testRingbaConnection(
  integration: IntegrationContext,
  overrides?: RingbaConnectionTestOverrides
): Promise<RingbaConnectionTestResult> {
  const pub = getPublicIntegrationRingbaConfig(integration.config);
  const savedToken = getRingbaApiAccessTokenFromConfig(integration.config);
  const accountId = (overrides?.accountId ?? pub.ringbaAccountId).trim();
  // Prefer a freshly-typed token; fall back to the saved one.
  const token = (overrides?.apiToken?.trim() || savedToken || "").trim();
  if (!token || !accountId) {
    return {
      ok: false,
      sampleCount: 0,
      error: "Enter the Ringba account id and API token above (or save settings) before testing.",
    };
  }

  const timeZone = (overrides?.timeZone ?? pub.callLogsTimeZone).trim() || "America/Chicago";
  const { reportStart, reportEnd } = buildRingbaCallLogsReportRange(24);

  try {
    const result = await fetchRingbaCallLogsPage({
      accountId,
      apiToken: token,
      reportStart,
      reportEnd,
      formatTimeZone: timeZone,
      offset: 0,
      size: 1,
    });
    const sampleCount = (result.report?.records ?? []).length;
    return { ok: true, sampleCount };
  } catch (error) {
    return {
      ok: false,
      sampleCount: 0,
      error: error instanceof Error ? error.message : "Ringba connection test failed.",
    };
  }
}

function isoOrThrow(value: string, label: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return new Date(ms).toISOString();
}

/**
 * Run a controlled, user-driven Ringba Call Logs API import. Imports metadata /
 * recording links only — it NEVER enqueues transcription or analysis. AI is gated
 * behind enqueueAnalysisForCalls (the analyze-selected endpoint). A hard cap of
 * RINGBA_MANUAL_IMPORT_MAX_RECORDS is enforced regardless of the requested value.
 */
export async function runRingbaManualImport(
  client: SupabaseAny,
  integration: IntegrationContext,
  rawInput: RingbaManualImportInput & { requestedBy: string | null }
): Promise<RingbaManualImportResult> {
  const parsed = ringbaManualImportInputSchema.parse(rawInput);
  const requestedBy = rawInput.requestedBy ?? null;

  const dateStartIso = isoOrThrow(parsed.dateStartIso, "dateStart");
  const dateEndIso = isoOrThrow(parsed.dateEndIso, "dateEnd");
  if (Date.parse(dateStartIso) > Date.parse(dateEndIso)) {
    throw new Error("dateStart must be on or before dateEnd.");
  }

  const requestedMax = Math.floor(parsed.maxRecords);
  const maxRecords = Math.min(requestedMax, RINGBA_MANUAL_IMPORT_MAX_RECORDS);
  const capped = requestedMax > RINGBA_MANUAL_IMPORT_MAX_RECORDS;

  const pub = getPublicIntegrationRingbaConfig(integration.config);
  const token = getRingbaApiAccessTokenFromConfig(integration.config);
  const accountId = pub.ringbaAccountId.trim();
  if (!token || !accountId) {
    throw new Error("Ringba API token or account id is not configured.");
  }

  const recordingOnly = parsed.recordingOnly ?? true;
  const minimumDurationSeconds =
    parsed.minimumDurationSeconds ?? getRingbaMinimumDurationSeconds(integration);
  const timeZone = pub.callLogsTimeZone.trim() || "America/Chicago";
  const { reportStart, reportEnd } = buildRingbaReportRangeFromDates(dateStartIso, dateEndIso);

  // Record the batch up front so a mid-run failure is still visible/auditable.
  const batchInsert = await client
    .from("ringba_import_batches")
    .insert({
      organization_id: integration.organizationId,
      integration_id: integration.id,
      requested_by: requestedBy,
      date_start: dateStartIso,
      date_end: dateEndIso,
      max_records: maxRecords,
      import_behavior: parsed.importBehavior,
      status: "running",
    } satisfies TablesInsert<"ringba_import_batches">)
    .select("id")
    .single();

  if (batchInsert.error || !batchInsert.data) {
    throw new Error(batchInsert.error?.message ?? "Unable to create Ringba import batch.");
  }
  const batchId = String((batchInsert.data as { id: string }).id);

  const finalizeFailed = async (message: string): Promise<RingbaManualImportResult> => {
    await client
      .from("ringba_import_batches")
      .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
      .eq("organization_id", integration.organizationId)
      .eq("id", batchId);
    return {
      batchId,
      status: "failed",
      recordsSeen: 0,
      recordsImported: 0,
      recordingsImported: 0,
      rejectedCount: 0,
      callIds: [],
      importedCalls: [],
      capped,
      error: message,
    };
  };

  const normalizedCalls: Array<Record<string, unknown>> = [];
  let recordsSeen = 0;

  try {
    let offset = 0;
    for (let page = 0; page < RINGBA_MANUAL_IMPORT_MAX_PAGES; page += 1) {
      const pageResult = await fetchRingbaCallLogsPage({
        accountId,
        apiToken: token,
        reportStart,
        reportEnd,
        formatTimeZone: timeZone,
        offset,
        size: RINGBA_CALLLOG_PAGE_SIZE,
      });

      const records = (pageResult.report?.records ?? []) as RingbaCallLogRow[];
      if (records.length === 0) {
        break;
      }
      recordsSeen += records.length;

      const rows = recordingOnly ? filterRecordingRows(records) : records;
      for (const row of rows) {
        const mapped = mapRingbaCallLogRowToNormalizedCall(row, {
          timeZone,
          minimumDurationSeconds,
          requireRecording: recordingOnly,
        });
        if (mapped) {
          normalizedCalls.push(mapped);
        }
        if (normalizedCalls.length >= maxRecords) {
          break;
        }
      }

      if (normalizedCalls.length >= maxRecords) {
        break;
      }
      if (records.length < RINGBA_CALLLOG_PAGE_SIZE) {
        break;
      }
      offset += RINGBA_CALLLOG_PAGE_SIZE;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ringba API request failed.";
    await recordIntegrationEvent(client, integration, {
      eventType: "ringba.api.import_failed",
      message: `Ringba manual import failed for ${integration.displayName}: ${message}`,
      severity: "error",
      payload: { reason: "ringba_http_error", batchId, reportStart, reportEnd },
    });
    return finalizeFailed(message);
  }

  const payload: Record<string, unknown> = {
    provider: "ringba",
    platform: "ringba",
    ingestionMode: "api",
    eventType: "ringba.api.import",
  };

  // Cost control: metadata-only. enqueueAiJobs:false guarantees no transcription/
  // analysis jobs are created even though calls carry recording URLs.
  const result = await ingestIntegrationCalls(client, integration, payload, normalizedCalls, {
    completionEventKind: "ringba_api",
    enqueueAiJobs: false,
  });

  const status: RingbaManualImportResult["status"] =
    result.rejectedCount > 0 ? (result.ingestedCount > 0 ? "partial" : "failed") : "completed";

  const update = await client
    .from("ringba_import_batches")
    .update({
      records_seen: recordsSeen,
      records_imported: result.ingestedCount,
      recordings_imported: result.recordingCount,
      status,
      error: result.rejectedCount > 0 ? `${result.rejectedCount} record(s) rejected.` : null,
      completed_at: new Date().toISOString(),
    })
    .eq("organization_id", integration.organizationId)
    .eq("id", batchId);

  if (update.error) {
    return finalizeFailed(update.error.message);
  }

  // Re-read the imported calls (bounded by maxRecords) so the UI can offer accurate
  // per-call selection for the analyze gate.
  const importedCalls: RingbaImportedCallSummary[] = [];
  if (result.importedCallIds.length > 0) {
    const callRows = await client
      .from("calls")
      .select("id, caller_number, duration_seconds, recording_url")
      .eq("organization_id", integration.organizationId)
      .in("id", result.importedCallIds);
    if (!callRows.error) {
      for (const row of callRows.data ?? []) {
        importedCalls.push({
          callId: String(row.id),
          callerNumber: String(row.caller_number ?? ""),
          durationSeconds: Number(row.duration_seconds ?? 0),
          hasRecording: Boolean(row.recording_url),
        });
      }
    }
  }

  await insertAuditLog(client, {
    organizationId: integration.organizationId,
    actorUserId: requestedBy,
    entityType: "integration",
    entityId: integration.id,
    action: "integration.ringba_api.manual_import",
    metadata: {
      batchId,
      recordsSeen,
      recordsImported: result.ingestedCount,
      recordingsImported: result.recordingCount,
      rejectedCount: result.rejectedCount,
      maxRecords,
      capped,
      recordingOnly,
      importBehavior: parsed.importBehavior,
    },
  });

  return {
    batchId,
    status,
    recordsSeen,
    recordsImported: result.ingestedCount,
    recordingsImported: result.recordingCount,
    rejectedCount: result.rejectedCount,
    callIds: result.importedCallIds,
    importedCalls,
    capped,
  };
}
