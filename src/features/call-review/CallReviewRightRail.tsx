import * as React from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { CallDetail, CallFlagItem } from "../../lib/app-data";
import { CallReviewActions } from "../calls/components/CallReviewActions";
import { formatTimestamp } from "./formatTime";

interface Props {
  detail: CallDetail;
  actionMutation: UseMutationResult<void, Error, Record<string, unknown>, unknown>;
  selectedFlagId: string | null;
  onSelectFlag: (id: string | null) => void;
  onJumpToFlag: (flag: CallFlagItem) => void;
  onReplayFlag: (flag: CallFlagItem) => void;
  onResolveFlag: (flag: CallFlagItem) => void;
  noteDraft: string;
  onNoteDraftChange: (v: string) => void;
  onSaveNoteAtTime: () => void;
  onDeleteNote: (id: string) => void;
  isNoteSaving: boolean;
  flagDraft: {
    title: string;
    flagCategory: string;
    severity: CallFlagItem["severity"];
    description: string;
  };
  onFlagDraftChange: (next: Props["flagDraft"]) => void;
  onCreateManualFlag: () => void;
  isFlagSaving: boolean;
  noteTextAreaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function CallReviewRightRail({
  detail,
  actionMutation,
  selectedFlagId,
  onSelectFlag,
  onJumpToFlag,
  onReplayFlag,
  onResolveFlag,
  noteDraft,
  onNoteDraftChange,
  onSaveNoteAtTime,
  onDeleteNote,
  isNoteSaving,
  flagDraft,
  onFlagDraftChange,
  onCreateManualFlag,
  isFlagSaving,
  noteTextAreaRef,
}: Props) {
  const openFlags = detail.flags.filter((f) => f.status === "open");

  return (
    <aside className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">AI Summary</p>
        <p className="text-sm leading-6 text-slate-200">
          {detail.analysisSummary ?? "No summary yet."}
        </p>
        {detail.complianceSummary && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
            <span className="font-semibold text-slate-400">Compliance</span>{" "}
            {detail.complianceStatus ? `(${detail.complianceStatus}) ` : ""}
            {detail.complianceSummary}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Flags</p>
          <span className="text-xs text-slate-500">{openFlags.length} open</span>
        </div>
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {detail.flags.length === 0 ? (
            <p className="text-sm text-slate-500">No flags on this call.</p>
          ) : (
            detail.flags.map((flag) => (
              <div
                key={flag.id}
                className={`rounded-xl border px-3 py-3 space-y-2 ${
                  selectedFlagId === flag.id ? "border-violet-500/60 bg-violet-950/30" : "border-slate-800 bg-slate-950/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectFlag(flag.id)}
                  className="w-full text-left"
                >
                  <p className="text-sm font-semibold text-white">{flag.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatFlagRange(flag)}
                    {" · "}
                    {flag.severity} · {flag.status} · {flag.source}
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onJumpToFlag(flag)}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                  >
                    Jump
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplayFlag(flag)}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                  >
                    Replay
                  </button>
                  {flag.status === "open" && (
                    <button
                      type="button"
                      disabled={actionMutation.isPending}
                      onClick={() => onResolveFlag(flag)}
                      className="rounded-lg border border-emerald-800/60 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Add manual flag</p>
          <input
            value={flagDraft.title}
            onChange={(e) => onFlagDraftChange({ ...flagDraft, title: e.target.value })}
            placeholder="Title"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={flagDraft.flagCategory}
              onChange={(e) => onFlagDraftChange({ ...flagDraft, flagCategory: e.target.value })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
            >
              <option value="compliance">compliance</option>
              <option value="qualification">qualification</option>
              <option value="agent_quality">agent_quality</option>
              <option value="customer_intent">customer_intent</option>
              <option value="follow_up">follow_up</option>
              <option value="transcript_quality">transcript_quality</option>
              <option value="operational">operational</option>
            </select>
            <select
              value={flagDraft.severity}
              onChange={(e) =>
                onFlagDraftChange({ ...flagDraft, severity: e.target.value as CallFlagItem["severity"] })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>
          <textarea
            value={flagDraft.description}
            onChange={(e) => onFlagDraftChange({ ...flagDraft, description: e.target.value })}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            disabled={isFlagSaving || !flagDraft.title.trim()}
            onClick={onCreateManualFlag}
            className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Save flag at playhead
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</p>
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {detail.reviewNotes.length === 0 ? (
            <p className="text-xs text-slate-500">No notes yet.</p>
          ) : (
            detail.reviewNotes.map((n) => (
              <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2 text-slate-500">
                  <span>{formatTimestamp(n.startSeconds)}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(n.id)}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
                <p className="mt-1 text-slate-200">{n.body}</p>
              </div>
            ))
          )}
        </div>
        <textarea
          ref={noteTextAreaRef}
          value={noteDraft}
          onChange={(e) => onNoteDraftChange(e.target.value)}
          placeholder="Note at current playhead…"
          rows={3}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button
          type="button"
          disabled={isNoteSaving || !noteDraft.trim()}
          onClick={onSaveNoteAtTime}
          className="w-full rounded-xl border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Save note
        </button>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <CallReviewActions
          detail={detail}
          isPending={actionMutation.isPending}
          onReviewStatus={(reviewStatus, reviewNotes, finalDisposition) =>
            actionMutation.mutate({
              action: "review-status",
              reviewStatus,
              reviewNotes,
              finalDisposition,
            })
          }
          onOverrideDisposition={(newDisposition, reason) =>
            actionMutation.mutate({
              action: "override-disposition",
              newDisposition,
              reason,
            })
          }
        />
      </section>
    </aside>
  );
}

function formatFlagRange(flag: CallFlagItem) {
  if (flag.startSeconds == null) {
    return "Time unknown";
  }
  if (flag.endSeconds == null) {
    return `${formatTimestamp(flag.startSeconds)}`;
  }
  return `${formatTimestamp(flag.startSeconds)}–${formatTimestamp(flag.endSeconds)}`;
}
