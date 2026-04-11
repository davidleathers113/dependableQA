import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "../../supabase/types";
import { insertAuditLog, isValidImportStoragePath, slugify } from "../lib/app-data";
import { getImportBatchFinalStatus, parseCsv, type CsvRow } from "./import-csv";

type SupabaseAny = SupabaseClient<Database>;

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

function canDispatchExistingBatch(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized === "uploaded" || normalized === "failed" || normalized === "partial";
}

export async function dispatchImportBatch(
  client: SupabaseAny,
  options: { organizationId: string; batchId: string; actorUserId: string | null }
) {
  const batchResult = await client
    .from("import_batches")
    .select("id, filename, storage_path, source_provider, status")
    .eq("organization_id", options.organizationId)
    .eq("id", options.batchId)
    .single();

  if (batchResult.error || !batchResult.data) {
    throw new Error(batchResult.error?.message ?? "Batch not found.");
  }

  const batch = batchResult.data;
  const currentStatus = asString(batch.status);

  if (currentStatus.trim().toLowerCase() === "processing") {
    throw new Error("This batch is already processing. Wait for it to finish before retrying dispatch.");
  }

  if (!canDispatchExistingBatch(currentStatus)) {
    throw new Error("Retry dispatch is only available for uploaded, failed, or partial batches.");
  }

  try {
    const clearErrorsResult = await client
      .from("import_row_errors")
      .delete()
      .eq("organization_id", options.organizationId)
      .eq("import_batch_id", options.batchId);

    if (clearErrorsResult.error) {
      throw new Error(clearErrorsResult.error.message);
    }

    const startResult = await client
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
      .eq("organization_id", options.organizationId);

    if (startResult.error) {
      throw new Error(startResult.error.message);
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
          source_provider: batch.source_provider,
          current_disposition: disposition || null,
          current_review_status: "unreviewed",
          source_status: "received",
        };

        const callInsert = await client
          .from("calls")
          .insert(callPayload)
          .select("id")
          .single();

        if (callInsert.error || !callInsert.data) {
          rejectedCount += 1;
          await insertRowError(
            client,
            options.organizationId,
            options.batchId,
            rowNumber,
            "CALL_INSERT_FAILED",
            callInsert.error?.message ?? "Unable to create call record.",
            row
          );
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
          });

          if (transcriptInsert.error) {
            throw new Error(transcriptInsert.error.message);
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

    const finalStatus = getImportBatchFinalStatus(acceptedCount, rejectedCount);

    const updateResult = await client
      .from("import_batches")
      .update({
        status: finalStatus,
        row_count_total: rows.length,
        row_count_accepted: acceptedCount,
        row_count_rejected: rejectedCount,
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
      action: "import.dispatch.completed",
      after: {
        acceptedCount,
        rejectedCount,
        rowCountTotal: rows.length,
        status: finalStatus,
      },
      metadata: {
        summary: `Processed ${acceptedCount} rows and rejected ${rejectedCount}.`,
        filename: asString(batch.filename),
      },
    });

    return {
      acceptedCount,
      rejectedCount,
      rowCountTotal: rows.length,
      status: finalStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dispatch import batch.";
    await markImportBatchFailed(client, options, asString(batch.filename), message);
    throw new Error(message);
  }
}
