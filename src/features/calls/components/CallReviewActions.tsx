import * as React from "react";
import type { CallDetail, ReviewStatus } from "../../../lib/app-data";

interface Props {
  detail: CallDetail;
  isPending: boolean;
  onReviewStatus: (reviewStatus: ReviewStatus, reviewNotes?: string, finalDisposition?: string) => void;
  onOverrideDisposition: (newDisposition: string, reason: string) => void;
}

export function CallReviewActions({ detail, isPending, onReviewStatus, onOverrideDisposition }: Props) {
  const [reviewNotes, setReviewNotes] = React.useState(detail.latestReviewNotes ?? "");
  const [overrideValue, setOverrideValue] = React.useState("");
  const [overrideReason, setOverrideReason] = React.useState("");

  React.useEffect(() => {
    setReviewNotes(detail.latestReviewNotes ?? "");
    setOverrideValue("");
    setOverrideReason("");
  }, [detail.id, detail.latestReviewNotes]);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Review Actions</h3>
          <p className="mt-1 text-xs text-slate-500">
            Current review state: <span className="uppercase tracking-wider">{detail.currentReviewStatus}</span>
          </p>
        </div>
        {detail.latestReviewedByName && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Latest Reviewer</p>
            <p className="mt-1 text-xs text-slate-300">{detail.latestReviewedByName}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            onReviewStatus(
              "reviewed",
              reviewNotes.trim() || undefined,
              detail.currentDisposition ?? detail.suggestedDisposition ?? "Reviewed"
            )
          }
          className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/20 hover:bg-violet-500 disabled:opacity-60"
        >
          Confirm Disposition
        </button>
        <button
          type="button"
          disabled={isPending || detail.currentReviewStatus === "in_review"}
          onClick={() => onReviewStatus("in_review", reviewNotes.trim() || undefined)}
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
        >
          Mark In Review
        </button>
        <button
          type="button"
          disabled={isPending || detail.currentReviewStatus === "reopened"}
          onClick={() => onReviewStatus("reopened", reviewNotes.trim() || undefined)}
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
        >
          Reopen Review
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onReviewStatus(detail.currentReviewStatus, reviewNotes.trim() || undefined, detail.currentDisposition ?? undefined)}
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
        >
          Save Review Note
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review Note</p>
        <textarea
          value={reviewNotes}
          onChange={(event) => setReviewNotes(event.target.value)}
          placeholder="Add reviewer context, QA rationale, or escalation notes."
          rows={4}
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Disposition Override</p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={overrideValue}
            onChange={(event) => setOverrideValue(event.target.value)}
            placeholder="Override disposition"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <input
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder="Why are you overriding the disposition?"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            disabled={isPending || !overrideValue.trim() || !overrideReason.trim()}
            onClick={() => onOverrideDisposition(overrideValue.trim(), overrideReason.trim())}
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            Override
          </button>
        </div>
      </div>
    </section>
  );
}
