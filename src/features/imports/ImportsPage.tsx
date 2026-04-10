import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  createImportBatchRecord,
  getImportsPageData,
  normalizeFilename,
  type ImportsPageData,
  type IntegrationProvider,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  userId: string;
  initialData: ImportsPageData;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ImportsPageInner({ organizationId, userId, initialData }: Props) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = React.useState<IntegrationProvider>("custom");
  const [errorMessage, setErrorMessage] = React.useState("");

  const importsQuery = useQuery({
    queryKey: ["imports", organizationId],
    queryFn: () => getImportsPageData(getBrowserSupabase(), organizationId),
    initialData,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const supabase = getBrowserSupabase();
      const safeName = `${Date.now()}-${normalizeFilename(file.name)}`;
      const storagePath = `${organizationId}/${safeName}`;

      const upload = await supabase.storage.from("imports").upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (upload.error) {
        throw new Error(upload.error.message);
      }

      const batchId = await createImportBatchRecord(supabase, {
        organizationId,
        userId,
        fileName: file.name,
        storagePath,
        sourceProvider: provider,
      });

      const dispatchResponse = await fetch("/api/imports/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ batchId }),
      });

      const dispatchPayload = (await dispatchResponse.json().catch(() => ({}))) as { error?: string };
      if (!dispatchResponse.ok) {
        throw new Error(dispatchPayload.error ?? "Unable to dispatch import batch.");
      }

      return batchId;
    },
    onSuccess: async (batchId) => {
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: ["imports", organizationId] });
      window.location.assign(`/app/imports/${batchId}`);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload file.");
    },
  });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Imports</h1>
        <p className="text-sm text-slate-400">
          Upload CSVs, inspect validation results, and track batch processing.
        </p>
      </header>

      <div className="rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/50 p-8 text-center hover:border-violet-500/50 transition-colors">
        <div className="mx-auto flex max-w-xl flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl">
            📤
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">Upload a provider CSV and dispatch normalization immediately.</p>
            <p className="mt-1 text-xs text-slate-500">Supported: TrackDrive, Ringba, Retreaver, or generic custom exports.</p>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-[180px_1fr]">
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as IntegrationProvider)}
              className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="custom">Custom</option>
              <option value="trackdrive">TrackDrive</option>
              <option value="ringba">Ringba</option>
              <option value="retreaver">Retreaver</option>
            </select>
            <label className="flex h-10 cursor-pointer items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition-colors hover:bg-violet-500">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    uploadMutation.mutate(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
              {uploadMutation.isPending ? "Uploading..." : "Select CSV"}
            </label>
          </div>
          {errorMessage && (
            <div className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-sm font-semibold text-white">Recent Batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Filename</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Accepted</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Rejected</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Created</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {importsQuery.data.batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No import batches found for this organization.
                  </td>
                </tr>
              ) : (
                importsQuery.data.batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-6 py-4 text-slate-200">{batch.filename}</td>
                    <td className="px-6 py-4 text-slate-400">{batch.status}</td>
                    <td className="px-6 py-4 text-slate-400">{batch.rowCountAccepted}</td>
                    <td className="px-6 py-4 text-slate-400">{batch.rowCountRejected}</td>
                    <td className="px-6 py-4 text-slate-400">{formatDateTime(batch.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <a href={`/app/imports/${batch.id}`} className="text-xs font-semibold text-violet-400 hover:text-violet-300">
                        Open
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function ImportsPage(props: Props) {
  return (
    <QueryProvider>
      <ImportsPageInner {...props} />
    </QueryProvider>
  );
}
