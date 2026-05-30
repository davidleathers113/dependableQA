import * as React from "react";
import type { CallFlagItem } from "../../lib/app-data";
import { formatTimestamp } from "./formatTime";

export interface FlagDraft {
  title: string;
  flagCategory: string;
  severity: CallFlagItem["severity"];
  description: string;
}

export interface FlagAnchor {
  startSeconds: number;
  endSeconds: number | null;
  /** Transcript excerpt shown as evidence context, when flagging from a turn. */
  excerpt: string | null;
  source: "playhead" | "transcript";
}

interface Props {
  open: boolean;
  anchor: FlagAnchor | null;
  draft: FlagDraft;
  onDraftChange: (next: FlagDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSaving: boolean;
}

const CATEGORIES = [
  "compliance",
  "qualification",
  "agent_quality",
  "customer_intent",
  "follow_up",
  "transcript_quality",
  "operational",
];

const SEVERITIES: CallFlagItem["severity"][] = ["low", "medium", "high", "critical"];

/**
 * Slide-over drawer for creating a manual flag. Replaces the always-visible
 * form so the right panel stays useful. Anchored either to the current
 * playhead or to a specific transcript turn (with its excerpt as context).
 */
export function FlagDrawer({ open, anchor, draft, onDraftChange, onClose, onSubmit, isSaving }: Props) {
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !anchor) {
    return null;
  }

  const rangeLabel =
    anchor.endSeconds != null
      ? `${formatTimestamp(anchor.startSeconds)}–${formatTimestamp(anchor.endSeconds)}`
      : formatTimestamp(anchor.startSeconds);

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Create flag">
      <button
        type="button"
        aria-label="Close flag drawer"
        onClick={onClose}
        className="flex-1 cursor-default bg-slate-950/70"
      />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">New flag</p>
            <p className="mt-1 font-mono text-sm text-slate-200">{rangeLabel}</p>
            <p className="text-xs text-slate-500">
              {anchor.source === "transcript" ? "From transcript turn" : "From playhead"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        {anchor.excerpt && (
          <blockquote className="mt-4 border-l-2 border-violet-500/60 bg-slate-950/60 px-3 py-2 text-xs italic leading-5 text-slate-300">
            {anchor.excerpt}
          </blockquote>
        )}

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Title</span>
            <input
              ref={titleRef}
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
              placeholder="What's wrong here?"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Category</span>
              <select
                value={draft.flagCategory}
                onChange={(e) => onDraftChange({ ...draft, flagCategory: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Severity</span>
              <select
                value={draft.severity}
                onChange={(e) =>
                  onDraftChange({ ...draft, severity: e.target.value as CallFlagItem["severity"] })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</span>
            <textarea
              value={draft.description}
              onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              placeholder="Add detail or evidence (optional)"
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
        </div>

        <div className="mt-auto flex gap-2 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || !draft.title.trim()}
            onClick={onSubmit}
            className="flex-1 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Create flag"}
          </button>
        </div>
      </div>
    </div>
  );
}
