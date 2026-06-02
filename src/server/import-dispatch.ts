import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "../../supabase/types";
import { insertAuditLog, isValidImportStoragePath, slugify } from "../lib/app-data";
import { enqueueAiJob } from "./ai-jobs";
import {
  ANALYZE_SELECTED_MAX_BATCH,
  enqueueAnalysisForCalls,
  InsufficientBalanceError,
} from "./analyze-selection";
import { getImportBatchFinalStatus, parseCsv, type CsvRow } from "./import-csv";

type SupabaseAny = SupabaseClient<Database>;

/**
 * Outcome of the reservation-backed AI queue step for a CSV opt-in import.
 * `attempted: false` means the user did not opt in (or no analyzable calls were
 * imported). When attempted, `blocked` distinguishes a wallet/cap failure (the
 * metadata import still succeeds) from a successful queue.
 */
export type ImportAiQueueOutcome =
  | { attempted: false }
  | {
      attempted: true;
      blocked: boolean;
      reason: string | null;
      transcriptionQueued: number;
      analysisQueued: number;
      skipped: number;
      requiredCents: number | null;
      availableCents: number | null;
    };

function chunkIds(ids: string[], size: number): string[][] {
  const groups: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    groups.push(ids.slice(index, index + size));
  }
  return groups;
}

/**
 * Queue paid AI for opted-in CSV imports through the same reservation-backed gate
 * the Calls list and Ringba import use (`enqueueAnalysisForCalls`): wallet reserve,
 * org scoping, skip reasons, and the per-request batch cap all stay consistent.
 * Chunked to the cap so a large CSV still queues like repeated analyze-selected
 * calls. A wallet/cap failure stops further queueing and is reported as `blocked`
 * — it never fails the (already-committed) metadata import.
 */
async function queueImportAnalysis(
  client: SupabaseAny,
  organizationId: string,
  actorUserId: string | null,
  callIds: string[]
): Promise<ImportAiQueueOutcome> {
  if (callIds.length === 0) {
    return { attempted: false };
  }

  let transcriptionQueued = 0;
  let analysisQueued = 0;
  let skipped = 0;
  let blocked = false;
  let reason: string | null = null;
  let requiredCents: number | null = null;
  let availableCents: number | null = null;

  for (const group of chunkIds(callIds, ANALYZE_SELECTED_MAX_BATCH)) {
    try {
      const result = await enqueueAnalysisForCalls(client, {
        organizationId,
        callIds: group,
        actorUserId,
      });
      transcriptionQueued += result.transcriptionQueued;
      analysisQueued += result.analysisQueued;
      skipped += result.skipped.length;
    } catch (error) {
      blocked = true;
      if (error instanceof InsufficientBalanceError) {
        reason = "insufficient_balance";
        requiredCents = error.requiredCents;
        availableCents = error.availableCents;
      } else {
        reason = error instanceof Error ? error.message : "Unable to queue AI analysis.";
      }
      break;
    }
  }

  return {
    attempted: true,
    blocked,
    reason,
    transcriptionQueued,
    analysisQueued,
    skipped,
    requiredCents,
    availableCents,
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstValue(record: CsvRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function toIsoDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function toInteger(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed);
}

async function ensureNamedEntity(
  client: SupabaseAny,
  table: "publishers" | "campaigns",
  organizationId: string,
  name: string
) {
  if (!name.trim()) {
    return null;
  }

  const normalizedName = slugify(name);
  const existing = await client
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (existing.data) {
    return asString((existing.data as Record<string, unknown>).id);
  }

  const created = await client
    .from(table)
    .insert({
      organization_id: organizationId,
      name,
      normalized_name: normalizedName,
      external_refs: {},
    })
    .select("id")
    .single();

  if (created.error) {
    throw new Error(created.error.message);
  }

  return asString((created.data as Record<string, unknown>).id);
}

async function insertRowError(
  client: SupabaseAny,
  organizationId: string,
  importBatchId: string,
  rowNumber: number,
  errorCode: string,
  errorMessage: string,
  rawRow: CsvRow
) {
  const { error } = await client.from("import_row_errors").insert({
    organization_id: organizationId,
    import_batch_id: importBatchId,
    row_number: rowNumber,
    error_code: errorCode,
    error_message: errorMessage,
    raw_row: rawRow,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function markImportBatchFailed(
  client: SupabaseAny,
  options: { organizationId: string; batchId: string; actorUserId: string | null },
  filename: string,
  message: string
) {
  const updateResult = await client
    .from("import_batches")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", options.batchId)
    .eq("organization_id", options.organizationId);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  await insertAuditLog(client, {
    organizationId: options.organizationId,
    actorUserId: options.actorUserId,
    entityType: "import_batch",
    entityId: options.batchId,
    action: "import.dispatch.failed",
    metadata: {
      summary: message,
      filename,
    },
  });
}

export async function dispatchImportBatch(
  client: SupabaseAny,
  options: {
    organizationId: string;
    batchId: string;
    actorUserId: string | null;
    /**
     * Legacy direct enqueue path (un-reserved `enqueueAiJob` per row). Defaults to
     * `true` for back-compat with internal/test callers only; the user-facing route
     * always passes `false` and drives AI through `analyzeOnImport` instead.
     * Suppressed whenever `analyzeOnImport` is true.
     */
    enqueueAiJobs?: boolean;
    /**
     * The user-facing CSV "Analyze with AI after import" opt-in. When true, metadata
     * is imported first and the newly accepted analyzable calls are queued through the
     * reservation-backed gate (`enqueueAnalysisForCalls`) — same wallet reserve, org
     * scoping, skip reasons, and batch cap as the Calls list / Ringba import. Default
     * (undefined/false) keeps CSV import metadata-only.
     */
    analyzeOnImport?: boolean;
  }
) {
  const analyzeOnImport = options.analyzeOnImport === true;
  // Legacy inline enqueue is mutually exclusive with the reservation-backed gate.
  const legacyInlineEnqueue = (options.enqueueAiJobs ?? true) && !analyzeOnImport;
  // Accepted, analyzable call ids to route through the reservation gate (opt-in only).
  const analyzeCallIds: string[] = [];
  // Atomically claim the batch. Only one dispatch can flip a dispatchable batch
  // (uploaded/failed/partial) to processing: the status precondition on the UPDATE
  // plus the row lock means a concurrent or double dispatch matches zero rows and
  // bails here, instead of racing through the old read-then-write claim and both
  // proceeding to parse the same file.
  const claim = await client
    .from("import_batches")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      completed_at: null,
      row_count_total: 0,
      row_count_accepted: 0,
      row_count_rejected: 0,
    })
    .eq("id", options.batchId)
    .eq("organization_id", options.organizationId)
    .in("status", ["uploaded", "failed", "partial"])
    .select("id, filename, storage_path, source_provider")
    .maybeSingle();

  if (claim.error) {
    throw new Error(claim.error.message);
  }

  if (!claim.data) {
    // The claim matched no row — surface why without re-attempting it.
    const current = await client
      .from("import_batches")
      .select("status")
      .eq("organization_id", options.organizationId)
      .eq("id", options.batchId)
      .maybeSingle();

    if (current.error) {
      throw new Error(current.error.message);
    }

    if (!current.data) {
      throw new Error("Batch not found.");
    }

    if (asString((current.data as Record<string, unknown>).status).trim().toLowerCase() === "processing") {
      throw new Error("This batch is already processing. Wait for it to finish before retrying dispatch.");
    }

    throw new Error("Retry dispatch is only available for uploaded, failed, or partial batches.");
  }

  const batch = claim.data;

  try {
    const clearErrorsResult = await client
      .from("import_row_errors")
      .delete()
      .eq("organization_id", options.organizationId)
      .eq("import_batch_id", options.batchId);

    if (clearErrorsResult.error) {
      throw new Error(clearErrorsResult.error.message);
    }

    const storagePath = asString(batch.storage_path);
    if (!isValidImportStoragePath(options.organizationId, storagePath)) {
      throw new Error("Import storage path is invalid for this organization.");
    }

    const download = await client.storage.from("imports").download(storagePath);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "Unable to read import file.");
    }

    const csvText = await download.data.text();
    const rows = parseCsv(csvText);
    let acceptedCount = 0;
    let rejectedCount = 0;
    let skippedCount = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const rowNumber = rowIndex + 2;
      const callerNumber = firstValue(row, ["caller_number", "caller", "phone", "phone_number"]);
      const destinationNumber = firstValue(row, ["destination_number", "target_number"]);
      const startedAt = toIsoDate(firstValue(row, ["started_at", "call_started_at", "timestamp", "created_at"]));
      const endedAt = toIsoDate(firstValue(row, ["ended_at", "call_ended_at"]));
      const durationSeconds = toInteger(firstValue(row, ["duration_seconds", "duration", "call_length_seconds"]));
      const externalCallId = firstValue(row, ["external_call_id", "call_id", "source_call_id"]);
      const campaignName = firstValue(row, ["campaign_name", "campaign"]);
      const publisherName = firstValue(row, ["publisher_name", "publisher"]);
      const transcriptText = firstValue(row, ["transcript_text", "transcript"]);
      const recordingUrl = firstValue(row, [
        "recording_url",
        "recording",
        "audio_url",
        "call_recording_url",
      ]);
      const language = firstValue(row, ["language", "audio_language", "transcript_language"]);
      const disposition = firstValue(row, ["current_disposition", "disposition"]);

      if (!callerNumber || !startedAt) {
        rejectedCount += 1;
        await insertRowError(
          client,
          options.organizationId,
          options.batchId,
          rowNumber,
          "INVALID_ROW",
          "Rows must include at least caller_number and started_at.",
          row
        );
        continue;
      }

      try {
        const publisherId = await ensureNamedEntity(client, "publishers", options.organizationId, publisherName);
        const campaignId = await ensureNamedEntity(client, "campaigns", options.organizationId, campaignName);
        const dedupeHash = `${asString(batch.source_provider)}:${externalCallId || callerNumber}:${startedAt}`;

        const callPayload: TablesInsert<"calls"> = {
          organization_id: options.organizationId,
          import_batch_id: options.batchId,
          publisher_id: publisherId,
          campaign_id: campaignId,
          external_call_id: externalCallId || null,
          dedupe_hash: dedupeHash,
          caller_number: callerNumber,
          destination_number: destinationNumber || null,
          started_at: startedAt,
          ended_at: endedAt || null,
          duration_seconds: durationSeconds,
          recording_url: recordingUrl || null,
          source_provider: batch.source_provider,
          current_disposition: disposition || null,
          current_review_status: "unreviewed",
          source_status: transcriptText || recordingUrl ? "received" : "missing_media",
          transcription_status: transcriptText ? "completed" : "pending",
          analysis_status: "pending",
        };

        const callInsert = await client
          .from("calls")
          .upsert(callPayload, { onConflict: "organization_id,dedupe_hash", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();

        if (callInsert.error) {
          rejectedCount += 1;
          await insertRowError(
            client,
            options.organizationId,
            options.batchId,
            rowNumber,
            "CALL_INSERT_FAILED",
            callInsert.error.message ?? "Unable to create call record.",
            row
          );
          continue;
        }

        if (!callInsert.data) {
          // A call with this (organization_id, dedupe_hash) already exists — a
          // re-dispatch or concurrent insert. Dedup: skip re-creating the snapshot /
          // transcript and re-enqueuing AI jobs, and don't count it as an error.
          skippedCount += 1;
          continue;
        }

        const callId = asString((callInsert.data as Record<string, unknown>).id);

        const snapshotPayload: TablesInsert<"call_source_snapshots"> = {
          organization_id: options.organizationId,
          call_id: callId,
          source_provider: batch.source_provider,
          source_kind: "csv",
          raw_payload: row,
          normalized_payload: {
            caller_number: callerNumber,
            destination_number: destinationNumber || null,
            started_at: startedAt,
            ended_at: endedAt || null,
            duration_seconds: durationSeconds,
            external_call_id: externalCallId || null,
            campaign_name: campaignName || null,
            publisher_name: publisherName || null,
            disposition: disposition || null,
            recording_url: recordingUrl || null,
          },
        };

        const snapshotInsert = await client.from("call_source_snapshots").insert(snapshotPayload);
        if (snapshotInsert.error) {
          throw new Error(snapshotInsert.error.message);
        }

        if (transcriptText) {
          const transcriptInsert = await client.from("call_transcripts").insert({
            organization_id: options.organizationId,
            call_id: callId,
            transcript_text: transcriptText,
            transcript_segments: [],
            transcription_version: "import",
          });

          if (transcriptInsert.error) {
            throw new Error(transcriptInsert.error.message);
          }

          if (legacyInlineEnqueue) {
            await enqueueAiJob(client, {
              organizationId: options.organizationId,
              callId,
              jobType: "analysis",
            });
          } else if (analyzeOnImport) {
            analyzeCallIds.push(callId);
          }
        } else if (recordingUrl) {
          if (legacyInlineEnqueue) {
            await enqueueAiJob(client, {
              organizationId: options.organizationId,
              callId,
              jobType: "transcription",
              payload: language ? { language } : {},
            });
          } else if (analyzeOnImport) {
            analyzeCallIds.push(callId);
          }
        }

        acceptedCount += 1;
      } catch (error) {
        rejectedCount += 1;
        await insertRowError(
          client,
          options.organizationId,
          options.batchId,
          rowNumber,
          "IMPORT_EXCEPTION",
          error instanceof Error ? error.message : "Unexpected import error.",
          row
        );
      }
    }

    // Deduped (already-existing) rows count toward success, not failure, so a
    // re-dispatch of a fully-imported batch resolves to completed rather than failed.
    const successCount = acceptedCount + skippedCount;
    const finalStatus = getImportBatchFinalStatus(successCount, rejectedCount);

    const updateResult = await client
      .from("import_batches")
      .update({
        status: finalStatus,
        row_count_total: rows.length,
        row_count_accepted: successCount,
        row_count_rejected: rejectedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", options.batchId)
      .eq("organization_id", options.organizationId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    // Metadata import is committed above. Only now do we attempt the opt-in AI
    // queue through the reservation gate, so a wallet/cap block never undoes the
    // imported calls — they stay available to analyze later from the Calls list.
    const aiQueue = analyzeOnImport
      ? await queueImportAnalysis(client, options.organizationId, options.actorUserId, analyzeCallIds)
      : ({ attempted: false } as ImportAiQueueOutcome);

    await insertAuditLog(client, {
      organizationId: options.organizationId,
      actorUserId: options.actorUserId,
      entityType: "import_batch",
      entityId: options.batchId,
      action: "import.dispatch.completed",
      after: {
        acceptedCount,
        skippedCount,
        rejectedCount,
        rowCountTotal: rows.length,
        status: finalStatus,
      },
      metadata: {
        summary: `Processed ${acceptedCount} new rows, skipped ${skippedCount} duplicates, rejected ${rejectedCount}.`,
        filename: asString(batch.filename),
        // Did the legacy inline path run, and what did the opt-in AI gate do?
        aiEnqueued: legacyInlineEnqueue,
        analyzeOnImport,
        aiQueue,
      },
    });

    return {
      acceptedCount,
      skippedCount,
      rejectedCount,
      rowCountTotal: rows.length,
      status: finalStatus,
      aiQueue,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dispatch import batch.";
    await markImportBatchFailed(client, options, asString(batch.filename), message);
    throw new Error(message);
  }
}
