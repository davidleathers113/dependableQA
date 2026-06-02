/** Client mirror of the server's `ImportAiQueueOutcome` (src/server/import-dispatch.ts). */
export interface ImportAiQueueResult {
  attempted: boolean;
  blocked: boolean;
  reason: string | null;
  transcriptionQueued: number;
  analysisQueued: number;
  skipped: number;
  requiredCents: number | null;
  availableCents: number | null;
}

export interface ImportDispatchResult {
  acceptedCount: number;
  rejectedCount: number;
  rowCountTotal: number;
  status: string;
  aiQueue: ImportAiQueueResult;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Defensively normalize the dispatch response's `aiQueue` into a stable client shape. */
export function parseAiQueue(value: unknown): ImportAiQueueResult {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    attempted: record.attempted === true,
    blocked: record.blocked === true,
    reason: typeof record.reason === "string" ? record.reason : null,
    transcriptionQueued: numberOr(record.transcriptionQueued, 0),
    analysisQueued: numberOr(record.analysisQueued, 0),
    skipped: numberOr(record.skipped, 0),
    requiredCents: nullableNumber(record.requiredCents),
    availableCents: nullableNumber(record.availableCents),
  };
}

export async function dispatchImportBatchRequest(batchId: string, analyzeOnImport = false) {
  const response = await fetch("/api/imports/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ batchId, analyzeOnImport }),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; aiQueue?: unknown } & Partial<ImportDispatchResult>;
  if (!response.ok) {
    const error = new Error(payload.error ?? "Unable to dispatch import batch.") as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }

  return {
    acceptedCount: Number(payload.acceptedCount ?? 0),
    rejectedCount: Number(payload.rejectedCount ?? 0),
    rowCountTotal: Number(payload.rowCountTotal ?? 0),
    status: typeof payload.status === "string" ? payload.status : "completed",
    aiQueue: parseAiQueue(payload.aiQueue),
  } satisfies ImportDispatchResult;
}
