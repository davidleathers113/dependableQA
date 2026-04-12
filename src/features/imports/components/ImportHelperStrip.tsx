import type { ImportMode } from "../helpers";

interface Props {
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  onOpenGuide: () => void;
}

export function ImportHelperStrip({ mode, onModeChange, onOpenGuide }: Props) {
  const isAuto = mode === "auto";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm">
      <p className="text-slate-300">
        {isAuto
          ? "Auto-detect is on for Ringba, TrackDrive, and Retreaver."
          : "Choose the provider format before continuing."}
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onOpenGuide}
          className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          Field guide
        </button>
        <button
          type="button"
          onClick={() => onModeChange(isAuto ? "manual" : "auto")}
          className="font-semibold text-slate-300 transition-colors hover:text-white"
        >
          {isAuto ? "Choose provider" : "Use auto-detect"}
        </button>
      </div>
    </div>
  );
}
