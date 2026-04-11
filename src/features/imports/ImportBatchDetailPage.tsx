import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { getImportBatchDetail, type ImportBatchDetail } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { dispatchImportBatchRequest } from "./api";
import { canRetryImportBatch, getImportRetryHelper, normalizeImportDispatchError } from "./helpers";

interface Props {
  organizationId: string;
  batchId: string;
  initialData: ImportBatchDetail | null;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ImportBatchDetailPageInner({ organizationId, batchId, initialData }: Props) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const batchQuery = useQuery({
    queryKey: ["import-batch", organizationId, batchId],
    queryFn: () => getImportBatchDetail(getBrowserSupabase(), organizationId, batchId),
    initialData,
  });

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      return dispatchImportBatchRequest(batchId);
    },
    onMutate: () => {
      setErrorMessage("");
      setSuccessMessage("");
    },
    onSuccess: async (result) => {
      setSuccessMessage(
        result.rejectedCount > 0
          ? `Retry finished. Accepted ${result.acceptedCount} rows and rejected ${result.rejectedCount}.`
          : `Retry finished. Accepted ${result.acceptedCount} rows with no rejections.`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["import-batch", organizationId, batchId] }),
        queryClient.invalidateQueries({ queryKey: ["imports", organizationId] }),
      ]);
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(normalizeImportDispatchError(error instanceof Error ? error.message : "Unable to re-run import."));
    },
  });

  const batch = batchQuery.data;
  if (!batch) {
    return (
      <section className="space-y-6">
        <a href="/app/imports" className="text-sm text-violet-400 hover:text-violet-300">
          Back to imports
        </a>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
          Import batch not found.
        </div>
      </section>
    );
  }

  const canRetry = canRetryImportBatch(batch.status);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <a href="/app/imports" className="text-sm text-violet-400 hover:text-violet-300">
          Back to imports
        </a>
        {canRetry ? (
          <button
            type="button"
            onClick={() => dispatchMutation.mutate()}
            disabled={dispatchMutation.isPending}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            {dispatchMutation.isPending ? "Dispatching..." : "Re-run Dispatch"}
          </button>
        ) : null}
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      )}

      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-semibold text-white">{batch.filename}</h1>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p>
            <p className="mt-1 text-sm text-slate-200">{batch.status}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Accepted</p>
            <p className="mt-1 text-sm text-slate-200">{batch.rowCountAccepted}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Rejected</p>
            <p className="mt-1 text-sm text-slate-200">{batch.rowCountRejected}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Calls Created</p>
            <p className="mt-1 text-sm text-slate-200">{batch.callCount}</p>
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-400">
          Created {formatDateTime(batch.createdAt)}. Processing window: {formatDateTime(batch.startedAt)} to {formatDateTime(batch.completedAt)}.
        </div>
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
          {getImportRetryHelper(batch.status)}
        </div>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Row-Level Errors</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Row</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Code</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Message</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Raw Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {batch.errors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No row-level errors were recorded for this batch.
                  </td>
                </tr>
              ) : (
                batch.errors.map((error) => (
                  <tr key={error.id}>
                    <td className="px-6 py-4 text-slate-300">{error.rowNumber}</td>
                    <td className="px-6 py-4 text-slate-300">{error.errorCode}</td>
                    <td className="px-6 py-4 text-slate-400">{error.errorMessage}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      <pre className="whitespace-pre-wrap break-all">{JSON.stringify(error.rawRow, null, 2)}</pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default function ImportBatchDetailPage(props: Props) {
  return (
    <QueryProvider>
      <ImportBatchDetailPageInner {...props} />
    </QueryProvider>
  );
}
