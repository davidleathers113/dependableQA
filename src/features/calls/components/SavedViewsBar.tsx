import * as React from "react";
import type { CallFilters, SavedViewSummary, CallTableDensity } from "../../../lib/app-data";

interface PresetView {
  id: string;
  label: string;
  filters: CallFilters;
}

interface Props {
  presets: PresetView[];
  savedViews: SavedViewSummary[];
  activePresetId: string | null;
  activeSavedViewId: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onSelectPreset: (preset: PresetView) => void;
  onSelectSavedView: (savedView: SavedViewSummary) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (savedViewId: string) => void;
  density: CallTableDensity;
}

export function SavedViewsBar({
  presets,
  savedViews,
  activePresetId,
  activeSavedViewId,
  isSaving,
  isDeleting,
  onSelectPreset,
  onSelectSavedView,
  onSaveView,
  onDeleteView,
  density,
}: Props) {
  const [viewName, setViewName] = React.useState("");

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Views</p>
            <p className="mt-1 text-sm text-slate-400">
              Use presets for common queues or save the current filter state for later.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Presets</p>
            <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  activePresetId === preset.id
                    ? "border-violet-500 bg-violet-500/15 text-violet-200 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]"
                    : "border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                }`}
              >
                {preset.label}
              </button>
            ))}
            </div>
          </div>

          {savedViews.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved Views</p>
              <div className="flex flex-wrap gap-2">
              {savedViews.map((savedView) => (
                <div
                  key={savedView.id}
                  className={`inline-flex items-center rounded-full border ${
                    activeSavedViewId === savedView.id
                      ? "border-violet-500/70 bg-violet-500/10"
                      : "border-slate-700 bg-slate-950/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSavedView(savedView)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeSavedViewId === savedView.id
                        ? "text-violet-200"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {savedView.name}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => onDeleteView(savedView.id)}
                    className="border-l border-slate-700 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-200 disabled:opacity-60"
                    aria-label={`Delete ${savedView.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:min-w-[320px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Save Current Layout</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="Name this saved view"
              className="h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="button"
              disabled={isSaving || !viewName.trim()}
              onClick={() => {
                onSaveView(viewName.trim());
                setViewName("");
              }}
              className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
            >
              Save View
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Current table density: {density}</p>
        </div>
      </div>
    </section>
  );
}
