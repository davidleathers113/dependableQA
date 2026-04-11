import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  buildImportStoragePath,
  createImportBatchRecord,
  getImportsPageData,
  type ImportBatchSummary,
  type ImportsPageData,
  type IntegrationProvider,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { dispatchImportBatchRequest } from "./api";
import { NewImportCard } from "./components/NewImportCard";
import { RecentImportsCard } from "./components/RecentImportsCard";
import {
  findDuplicateImportBatch,
  hasActiveImportBatches,
  isCsvFile,
  type ImportMode,
  normalizeImportDispatchError,
  normalizeImportUploadError,
  type ImportUploadErrorState,
  type ImportUploadPhase,
} from "./helpers";

interface Props {
  organizationId: string;
  userId: string;
  initialData: ImportsPageData;
}

function ImportsPageInner({ organizationId, userId, initialData }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<ImportMode>("auto");
  const [provider, setProvider] = React.useState<IntegrationProvider>("custom");
  const [uploadPhase, setUploadPhase] = React.useState<ImportUploadPhase>("idle");
  const [errorState, setErrorState] = React.useState<ImportUploadErrorState | null>(null);
  const [createdBatchId, setCreatedBatchId] = React.useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = React.useState("");
  const [retryingBatchId, setRetryingBatchId] = React.useState<string | null>(null);
  const [retryNotice, setRetryNotice] = React.useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);

  const importsQuery = useQuery({
    queryKey: ["imports", organizationId],
    queryFn: () => getImportsPageData(getBrowserSupabase(), organizationId),
    initialData,
    refetchInterval: (query) => {
      const data = query.state.data as ImportsPageData | undefined;
      return data && hasActiveImportBatches(data.batches) ? 5000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, sourceProvider }: { file: File; sourceProvider: IntegrationProvider }) => {
      const supabase = getBrowserSupabase();
      const storagePath = buildImportStoragePath(organizationId, file.name);
      let batchId: string | null = null;

      setUploadPhase("uploading");
      const upload = await supabase.storage.from("imports").upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (upload.error) {
        throw new Error(upload.error.message);
      }

      setUploadPhase("creating-batch");
      try {
        batchId = await createImportBatchRecord(supabase, {
          organizationId,
          userId,
          fileName: file.name,
          storagePath,
          sourceProvider,
        });
      } catch (error) {
        const createBatchError = error as Error & { stage?: ImportUploadPhase | null };
        createBatchError.stage = "creating-batch";
        throw createBatchError;
      }

      setCreatedBatchId(batchId);
      setUploadPhase("dispatching");
      try {
        await dispatchImportBatchRequest(batchId);
      } catch (error) {
        const dispatchError = error as Error & { batchId?: string | null; stage?: ImportUploadPhase | null; statusCode?: number };
        dispatchError.batchId = batchId;
        dispatchError.stage = dispatchError.statusCode === 401 ? null : "dispatching";
        throw dispatchError;
      }

      return batchId;
    },
    onMutate: () => {
      setErrorState(null);
      setCreatedBatchId(null);
      setRetryNotice(null);
    },
    onSuccess: async (batchId) => {
      setErrorState(null);
      setCreatedBatchId(batchId);
      await queryClient.invalidateQueries({ queryKey: ["imports", organizationId] });
      setUploadPhase("redirecting");
      window.setTimeout(() => {
        window.location.assign(`/app/imports/${batchId}`);
      }, 150);
    },
    onError: (error) => {
      const mutationError = error as Error & { batchId?: string | null; stage?: ImportUploadPhase | null };
      setUploadPhase("error");
      setErrorState(
        normalizeImportUploadError({
          message: error instanceof Error ? error.message : "Unable to upload file.",
          stage: mutationError.stage ?? null,
          batchId: mutationError.batchId ?? null,
        })
      );
      void queryClient.invalidateQueries({ queryKey: ["imports", organizationId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (batch: ImportBatchSummary) => {
      const result = await dispatchImportBatchRequest(batch.id);
      return { batch, result };
    },
    onMutate: (batch) => {
      setRetryingBatchId(batch.id);
      setRetryNotice(null);
    },
    onSuccess: async ({ batch, result }) => {
      const tone = result.rejectedCount > 0 ? "warning" : "success";
      const message =
        tone === "warning"
          ? `Retry finished for ${batch.filename}. Accepted ${result.acceptedCount} rows and rejected ${result.rejectedCount}.`
          : `Retry finished for ${batch.filename}. Accepted ${result.acceptedCount} rows with no rejections.`;

      setRetryNotice({ tone, message });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["imports", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["import-batch", organizationId, batch.id] }),
      ]);
    },
    onError: (error) => {
      setRetryNotice({
        tone: "error",
        message: normalizeImportDispatchError(error instanceof Error ? error.message : "Unable to re-run import."),
      });
    },
    onSettled: () => {
      setRetryingBatchId(null);
    },
  });

  const handleFile = React.useCallback(
    (file: File) => {
      setUploadPhase("validating");
      if (!isCsvFile(file)) {
        setDuplicateWarning("");
        setErrorState({
          message: "Only CSV files can be uploaded here.",
          batchId: null,
        });
        setUploadPhase("error");
        return;
      }

      const duplicateBatch = findDuplicateImportBatch(importsQuery.data.batches, file.name);
      setDuplicateWarning(
        duplicateBatch
          ? `A batch named ${duplicateBatch.filename} already exists in recent imports. You can still continue if this is a new export.`
          : ""
      );
      setErrorState(null);
      setRetryNotice(null);
      uploadMutation.mutate({ file, sourceProvider: mode === "manual" ? provider : "custom" });
    },
    [importsQuery.data.batches, mode, provider, uploadMutation]
  );

  const retryNoticeBanner = retryNotice ? (
    <div
      className={`rounded-xl px-4 py-3 text-sm ${
        retryNotice.tone === "success"
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
          : retryNotice.tone === "warning"
            ? "border border-amber-500/30 bg-amber-500/10 text-amber-100"
            : "border border-rose-500/30 bg-rose-500/10 text-rose-100"
      }`}
    >
      {retryNotice.message}
    </div>
  ) : null;

  const successMessage = createdBatchId && uploadPhase === "redirecting" ? "Import batch created. Opening batch detail..." : "";

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Imports</h1>
        <p className="text-sm text-slate-400">Upload call exports and monitor recent batches.</p>
      </header>

      <NewImportCard
        mode={mode}
        selectedProvider={provider}
        uploadPhase={uploadPhase}
        errorState={errorState}
        successMessage={successMessage}
        duplicateWarning={duplicateWarning}
        onModeChange={setMode}
        onProviderChange={setProvider}
        onFileSelected={handleFile}
      />

      <RecentImportsCard
        batches={importsQuery.data.batches}
        notice={retryNoticeBanner}
        onRetryBatch={(batch) => retryMutation.mutate(batch)}
        retryingBatchId={retryingBatchId}
      />
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
