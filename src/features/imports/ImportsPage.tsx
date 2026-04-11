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
import { ImportBatchTable } from "./components/ImportBatchTable";
import { ImportDropzone } from "./components/ImportDropzone";
import { ImportProviderHelp } from "./components/ImportProviderHelp";
import { ImportProviderSelector } from "./components/ImportProviderSelector";
import { ImportSummaryCards } from "./components/ImportSummaryCards";
import { ImportUploadError } from "./components/ImportUploadError";
import {
  IMPORT_UPLOAD_PHASE_LABELS,
  filterImportBatches,
  findDuplicateImportBatch,
  hasActiveImportBatches,
  isCsvFile,
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
  const [provider, setProvider] = React.useState<IntegrationProvider>("custom");
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploadPhase, setUploadPhase] = React.useState<ImportUploadPhase | null>(null);
  const [errorState, setErrorState] = React.useState<ImportUploadErrorState | null>(null);
  const [createdBatchId, setCreatedBatchId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [providerFilter, setProviderFilter] = React.useState<"all" | IntegrationProvider>("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | string>("all");
  const [duplicateWarning, setDuplicateWarning] = React.useState("");
  const [retryingBatchId, setRetryingBatchId] = React.useState<string | null>(null);
  const [retryNotice, setRetryNotice] = React.useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const dragDepthRef = React.useRef(0);

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

      setUploadPhase("creating");
      batchId = await createImportBatchRecord(supabase, {
        organizationId,
        userId,
        fileName: file.name,
        storagePath,
        sourceProvider,
      });

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
      setUploadPhase(null);
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

  const filteredBatches = React.useMemo(
    () =>
      filterImportBatches(importsQuery.data.batches, {
        search,
        provider: providerFilter,
        status: statusFilter,
      }),
    [importsQuery.data.batches, providerFilter, search, statusFilter]
  );

  const handleFile = React.useCallback(
    (file: File) => {
      if (!isCsvFile(file)) {
        setDuplicateWarning("");
        setErrorState({
          message: "Only CSV files can be uploaded here.",
          batchId: null,
        });
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
      uploadMutation.mutate({ file, sourceProvider: provider });
    },
    [importsQuery.data.batches, provider, uploadMutation]
  );

  const handleDragEnter = React.useCallback<React.DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      if (uploadMutation.isPending) {
        return;
      }

      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [uploadMutation.isPending]
  );

  const handleDragOver = React.useCallback<React.DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = uploadMutation.isPending ? "none" : "copy";
    },
    [uploadMutation.isPending]
  );

  const handleDragLeave = React.useCallback<React.DragEventHandler<HTMLDivElement>>((event) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = React.useCallback<React.DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);

      if (uploadMutation.isPending) {
        return;
      }

      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile, uploadMutation.isPending]
  );

  const successNotice =
    createdBatchId && uploadPhase === "redirecting" ? (
      <div className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left">
        <p className="text-sm font-medium text-emerald-100">Import batch created. Opening batch detail...</p>
        <a
          href={`/app/imports/${createdBatchId}`}
          className="mt-2 inline-flex text-sm font-semibold text-emerald-200 underline decoration-emerald-300/40 underline-offset-4 hover:text-white"
        >
          Open batch detail
        </a>
      </div>
    ) : null;

  const duplicateNotice = duplicateWarning ? (
    <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left">
      <p className="text-sm font-medium text-amber-100">{duplicateWarning}</p>
    </div>
  ) : null;

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

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Imports</h1>
        <p className="text-sm text-slate-400">
          Upload provider exports, reduce import mistakes, and monitor batch health from one place.
        </p>
      </header>

      <ImportDropzone
        isDragging={isDragging}
        isUploading={uploadMutation.isPending}
        uploadPhaseLabel={uploadPhase ? IMPORT_UPLOAD_PHASE_LABELS[uploadPhase] : null}
        onFileSelect={handleFile}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        providerSelector={
          <ImportProviderSelector
            value={provider}
            onChange={setProvider}
            disabled={uploadMutation.isPending}
          />
        }
        providerHelp={<ImportProviderHelp provider={provider} />}
        error={errorState ? <ImportUploadError error={errorState} /> : null}
        warning={duplicateNotice}
        success={successNotice}
      />

      <ImportSummaryCards batches={importsQuery.data.batches} />
      {retryNoticeBanner}
      <ImportBatchTable
        batches={importsQuery.data.batches}
        filteredBatches={filteredBatches}
        isRefreshing={importsQuery.isFetching}
        search={search}
        providerFilter={providerFilter}
        statusFilter={statusFilter}
        onSearchChange={setSearch}
        onProviderFilterChange={setProviderFilter}
        onStatusFilterChange={setStatusFilter}
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
