import * as React from "react";
import type { IntegrationProvider } from "../../../lib/app-data";
import type { ImportMode, ImportUploadErrorState, ImportUploadPhase } from "../helpers";
import { ImportDropzone } from "./ImportDropzone";
import { ImportHelperStrip } from "./ImportHelperStrip";
import { ImportProviderHint } from "./ImportProviderHint";
import { ImportProviderSelector } from "./ImportProviderSelector";
import { ImportStatusNotice } from "./ImportStatusNotice";

interface Props {
  mode: ImportMode;
  selectedProvider: IntegrationProvider;
  uploadPhase: ImportUploadPhase;
  errorState: ImportUploadErrorState | null;
  successMessage: string;
  duplicateWarning: string;
  onModeChange: (mode: ImportMode) => void;
  onProviderChange: (provider: IntegrationProvider) => void;
  onFileSelected: (file: File) => void;
}

export function NewImportCard({
  mode,
  selectedProvider,
  uploadPhase,
  errorState,
  successMessage,
  duplicateWarning,
  onModeChange,
  onProviderChange,
  onFileSelected,
}: Props) {
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);
  const isUploading =
    uploadPhase === "validating" ||
    uploadPhase === "uploading" ||
    uploadPhase === "creating-batch" ||
    uploadPhase === "dispatching" ||
    uploadPhase === "redirecting";

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">Import calls</h2>
        <p className="text-sm text-slate-400">Drop a CSV file here or browse to create a new import batch.</p>
      </div>

      <div className="mt-5 space-y-4">
        <ImportHelperStrip
          mode={mode}
          onModeChange={onModeChange}
          onOpenGuide={() => setIsGuideOpen((current) => !current)}
        />

        {isGuideOpen ? (
          <div
            id="import-format-guide"
            className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400"
          >
            <p className="font-semibold text-slate-200">Detected and supported fields</p>
            <p className="mt-1">
              DependableQA maps caller number, started time, duration, external call ID, campaign, publisher,
              disposition, destination number, and transcript fields when present.
            </p>
          </div>
        ) : null}

        {mode === "manual" ? (
          <ImportProviderSelector
            provider={selectedProvider}
            onChange={onProviderChange}
            disabled={isUploading}
          />
        ) : null}

        <ImportDropzone uploadPhase={uploadPhase} disabled={isUploading} onFileSelect={onFileSelected} />

        <ImportStatusNotice phase={uploadPhase} error={errorState} successMessage={successMessage} />

        {duplicateWarning ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {duplicateWarning}
          </div>
        ) : null}

        <ImportProviderHint
          mode={mode}
          provider={selectedProvider}
          onOpenGuide={() => setIsGuideOpen(true)}
        />

        <div className="border-t border-slate-800 pt-3 text-sm text-slate-500">
          Duplicate filenames may fail if the storage path already exists.
        </div>
      </div>
    </section>
  );
}
