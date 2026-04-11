export interface ImportDispatchResult {
  acceptedCount: number;
  rejectedCount: number;
  rowCountTotal: number;
  status: string;
}

export async function dispatchImportBatchRequest(batchId: string) {
  const response = await fetch("/api/imports/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ batchId }),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & Partial<ImportDispatchResult>;
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
  } satisfies ImportDispatchResult;
}
