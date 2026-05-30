import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../supabase/types";
import { insertAuditLog } from "../lib/app-data";
import { enqueueAiJob } from "./ai-jobs";
import { RINGBA_MANUAL_IMPORT_MAX_RECORDS } from "./ringba-calllogs";

type SupabaseAny = SupabaseClient<Database>;

/** Hard cap on how many calls one analyze-selected request may queue. */
export const ANALYZE_SELECTED_MAX_BATCH = RINGBA_MANUAL_IMPORT_MAX_RECORDS;

export const analyzeSelectedInputSchema = z
  .object({
    callIds: z.array(z.string().min(1)).optional(),
    importBatchId: z.string().min(1).optional(),
  })
  .refine((value) => (value.callIds?.length ?? 0) > 0, {
    message: "callIds must contain at least one call id.",
    path: ["callIds"],
  });

export type AnalyzeSelectedInput = z.infer<typeof analyzeSelectedInputSchema>;

export type AnalyzeSkipReason =
  | "not_in_org"
  | "no_media"
  | "already_queued";

export interface AnalyzeSelectionResult {
  requested: number;
  transcriptionQueued: number;
  analysisQueued: number;
  skipped: Array<{ callId: string; reason: AnalyzeSkipReason }>;
}

/**
 * Explicit AI-spend gate. Given a set of call ids, queue transcription (for calls
 * that have a recording but no transcript yet) and analysis (for calls that already
 * have a completed transcript). Enforces tenant isolation — calls outside the org are
 * dropped and reported as skipped — and a hard batch cap. Idempotent: enqueueAiJob is
 * dedupe-safe, so re-running does not double-queue.
 */
export async function enqueueAnalysisForCalls(
  client: SupabaseAny,
  options: {
    organizationId: string;
    callIds: string[];
    importBatchId?: string | null;
    actorUserId: string | null;
    maxBatchSize?: number;
  }
): Promise<AnalyzeSelectionResult> {
  const maxBatchSize = options.maxBatchSize ?? ANALYZE_SELECTED_MAX_BATCH;

  // Dedupe the requested ids while preserving determinism.
  const requestedIds = Array.from(new Set(options.callIds.filter((id) => id.length > 0)));
  if (requestedIds.length === 0) {
    throw new Error("callIds must contain at least one call id.");
  }
  if (requestedIds.length > maxBatchSize) {
    throw new Error(
      `Too many calls selected. The maximum per request is ${maxBatchSize} (received ${requestedIds.length}).`
    );
  }

  // If a batch id is supplied (for the audit trail), verify it belongs to this
  // org before we record it. The call ids are already org-scoped below, so this
  // is not a tenant-isolation control — it keeps a caller from stamping the
  // audit log with an arbitrary or cross-org batch id.
  if (options.importBatchId) {
    const batch = await client
      .from("ringba_import_batches")
      .select("id")
      .eq("id", options.importBatchId)
      .eq("organization_id", options.organizationId)
      .maybeSingle();
    if (batch.error) {
      throw new Error(batch.error.message);
    }
    if (!batch.data) {
      throw new Error("Import batch not found.");
    }
  }

  const callRows = await client
    .from("calls")
    .select("id, recording_url, transcription_status")
    .eq("organization_id", options.organizationId)
    .in("id", requestedIds);

  if (callRows.error) {
    throw new Error(callRows.error.message);
  }

  const found = new Map<string, { recordingUrl: string | null; transcriptionStatus: string }>();
  for (const row of callRows.data ?? []) {
    found.set(String(row.id), {
      recordingUrl: (row.recording_url as string | null) ?? null,
      transcriptionStatus: String(row.transcription_status ?? "pending"),
    });
  }

  const skipped: AnalyzeSelectionResult["skipped"] = [];
  let transcriptionQueued = 0;
  let analysisQueued = 0;

  for (const callId of requestedIds) {
    const call = found.get(callId);
    if (!call) {
      // Either does not exist or belongs to another organization.
      skipped.push({ callId, reason: "not_in_org" });
      continue;
    }

    if (call.transcriptionStatus === "completed") {
      await enqueueAiJob(client, {
        organizationId: options.organizationId,
        callId,
        jobType: "analysis",
      });
      analysisQueued += 1;
      continue;
    }

    if (call.recordingUrl) {
      // Transcription chains into analysis automatically on success.
      await enqueueAiJob(client, {
        organizationId: options.organizationId,
        callId,
        jobType: "transcription",
      });
      transcriptionQueued += 1;
      continue;
    }

    skipped.push({ callId, reason: "no_media" });
  }

  await insertAuditLog(client, {
    organizationId: options.organizationId,
    actorUserId: options.actorUserId,
    entityType: "call",
    entityId: options.importBatchId ? `ringba_import:${options.importBatchId}` : "analyze_selected",
    action: "calls.analyze_selected",
    metadata: {
      importBatchId: options.importBatchId ?? null,
      requested: requestedIds.length,
      transcriptionQueued,
      analysisQueued,
      skipped: skipped.length,
    },
  });

  return {
    requested: requestedIds.length,
    transcriptionQueued,
    analysisQueued,
    skipped,
  };
}
