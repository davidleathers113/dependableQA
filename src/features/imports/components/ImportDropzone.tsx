import * as React from "react";
import { FileUp } from "lucide-react";
import { getImportUploadPhaseCopy, type ImportUploadPhase } from "../helpers";

interface Props {
  uploadPhase: ImportUploadPhase;
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

export function ImportDropzone({ uploadPhase, onFileSelect, disabled }: Props) {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragDepthRef = React.useRef(0);
  const visualPhase = isDragging ? "dragging" : uploadPhase;
  const copy = getImportUploadPhaseCopy(visualPhase);
  const isBusy =
    disabled || uploadPhase === "uploading" || uploadPhase === "creating-batch" || uploadPhase === "dispatching";

  return (
    <div
      id="import-upload"
      className={`group flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        isDragging
          ? "border-violet-500 bg-violet-500/10"
          : "border-slate-800 bg-slate-950/40 hover:border-violet-500/50"
      }`}
      onClick={() => {
        if (!disabled) {
          document.getElementById("import-dropzone-input")?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (disabled) {
          return;
        }

        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);

        if (disabled) {
          return;
        }

        const file = event.dataTransfer.files?.[0];
        if (file) {
          onFileSelect(file);
        }
      }}
    >
      <input
        id="import-dropzone-input"
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFileSelect(file);
          }
          event.currentTarget.value = "";
        }}
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-200">
        <FileUp className="h-5 w-5" />
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-lg font-semibold text-slate-100">{copy.primary}</p>
        <p className="text-sm text-slate-400">{copy.secondary}</p>
        <p className="text-sm text-slate-500">
          {isBusy ? "Please wait while we prepare your batch." : "CSV only. Click anywhere in this area to browse."}
        </p>
      </div>
      <div className="mt-5">
        <span className="inline-flex rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 transition-colors group-hover:border-violet-500/40 group-hover:text-violet-200">
          Browse files
        </span>
      </div>
    </div>
  );
}
