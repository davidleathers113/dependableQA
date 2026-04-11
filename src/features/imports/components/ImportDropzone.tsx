import * as React from "react";
import { FileUp } from "lucide-react";

interface Props {
  isDragging: boolean;
  isUploading: boolean;
  uploadPhaseLabel: string | null;
  onFileSelect: (file: File) => void;
  onDragEnter: React.DragEventHandler<HTMLDivElement>;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  providerSelector: React.ReactNode;
  providerHelp: React.ReactNode;
  error: React.ReactNode;
  warning: React.ReactNode;
  success: React.ReactNode;
}

export function ImportDropzone({
  isDragging,
  isUploading,
  uploadPhaseLabel,
  onFileSelect,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  providerSelector,
  providerHelp,
  error,
  warning,
  success,
}: Props) {
  const helpText = isDragging ? "Drop CSV to upload" : "CSV only. Upload starts immediately after selection.";

  return (
    <div
      id="import-upload"
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
        isDragging
          ? "border-violet-500 bg-violet-500/10"
          : "border-slate-800 bg-slate-900/50 hover:border-violet-500/50"
      }`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mx-auto flex max-w-3xl flex-col space-y-5">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-200">
            <FileUp className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-100">Upload a CSV to create a new import batch.</p>
            <p className="text-sm text-slate-400">{helpText}</p>
            <p className="text-sm text-slate-500">
              We&apos;ll validate the file, create a batch, and send you to the batch detail page.
            </p>
            <p className="text-sm text-slate-500">Supported: TrackDrive, Ringba, Retreaver, and custom exports.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-4">{providerSelector}</div>
          <div className="space-y-4 text-left">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              {providerHelp}
              <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition-colors hover:bg-violet-500">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onFileSelect(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                {uploadPhaseLabel ?? "Select CSV"}
              </label>
            </div>

            <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <p>Accepted file type: CSV.</p>
              <p>Duplicate filenames may fail if the storage path already exists.</p>
              <p>Upload starts immediately after selection.</p>
              <p>Re-export the file and retry through a new batch if needed.</p>
            </div>
          </div>
        </div>

        {warning}
        {success}
        {error}
      </div>
    </div>
  );
}
