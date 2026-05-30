import * as React from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { CallDetail, CallFlagItem } from "../../lib/app-data";
import { CallReviewActions } from "../calls/components/CallReviewActions";
import { formatTimestamp } from "./formatTime";
import {
  formatConfidence,
  formatScore,
  humanizeToken,
  parseAnalysisInsights,
  type AnalysisInsights,
} from "./analysisInsights";

export type QaTab = "summary" | "disposition" | "flags" | "notes" | "qa";

interface Props {
  detail: CallDetail;
  actionMutation: UseMutationResult<void, Error, Record<string, unknown>, unknown>;
  tab: QaTab;
  onTabChange: (tab: QaTab) => void;
  selectedFlagId: string | null;
  onSelectFlag: (id: string | null) => void;
  onJumpToFlag: (flag: CallFlagItem) => void;
  onReplayFlag: (flag: CallFlagItem) => void;
  onResolveFlag: (flag: CallFlagItem) => void;
  onNewFlag: () => void;
  noteDraft: string;
  onNoteDraftChange: (v: string) => void;
  onSaveNoteAtTime: () => void;
  onDeleteNote: (id: string) => void;
  isNoteSaving: boolean;
  noteTextAreaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

const TABS: Array<{ id: QaTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "disposition", label: "Disposition" },
  { id: "flags", label: "Flags" },
  { id: "notes", label: "Notes" },
  { id: "qa", label: "QA" },
];

const SEVERITY_FILTERS: Array<"all" | CallFlagItem["severity"]> = [
  "all",
  "critical",
  "high",
  "medium",
  "low",
];

export function QaPanel({
  detail,
  actionMutation,
  tab,
  onTabChange,
  selectedFlagId,
  onSelectFlag,
  onJumpToFlag,
  onReplayFlag,
  onResolveFlag,
  onNewFlag,
  noteDraft,
  onNoteDraftChange,
  onSaveNoteAtTime,
  onDeleteNote,
  isNoteSaving,
  noteTextAreaRef,
}: Props) {
  const insights = React.useMemo(
    () => parseAnalysisInsights(detail.analysisStructuredOutput),
    [detail.analysisStructuredOutput]
  );
  const hasAnalysis = Boolean(detail.analysisSummary) || insights != null;
  const openFlags = detail.flags.filter((f) => f.status === "open");

  return (
    <aside className="flex max-h-[80vh] min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/80 lg:max-h-[calc(100vh-2rem)]">
      <div className="flex shrink-0 gap-1 border-b border-slate-800 p-1.5">
        {TABS.map((t) => {
          const count = t.id === "flags" ? detail.flags.length : t.id === "notes" ? detail.reviewNotes.length : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {t.label}
              {count != null && count > 0 && (
                <span className={`ml-1 ${tab === t.id ? "text-violet-200" : "text-slate-500"}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "summary" && <SummaryTab detail={detail} insights={insights} hasAnalysis={hasAnalysis} />}
        {tab === "disposition" && <DispositionTab insights={insights} />}
        {tab === "flags" && (
          <FlagsTab
            detail={detail}
            actionMutation={actionMutation}
            openFlagCount={openFlags.length}
            selectedFlagId={selectedFlagId}
            onSelectFlag={onSelectFlag}
            onJumpToFlag={onJumpToFlag}
            onReplayFlag={onReplayFlag}
            onResolveFlag={onResolveFlag}
            onNewFlag={onNewFlag}
          />
        )}
        {tab === "notes" && (
          <NotesTab
            detail={detail}
            noteDraft={noteDraft}
            onNoteDraftChange={onNoteDraftChange}
            onSaveNoteAtTime={onSaveNoteAtTime}
            onDeleteNote={onDeleteNote}
            isNoteSaving={isNoteSaving}
            noteTextAreaRef={noteTextAreaRef}
          />
        )}
        {tab === "qa" && <QaTab detail={detail} insights={insights} hasAnalysis={hasAnalysis} actionMutation={actionMutation} />}
      </div>
    </aside>
  );
}

function EmptyAnalysis() {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-6 text-center">
      <p className="text-sm font-medium text-slate-300">No AI analysis yet.</p>
      <p className="mt-1 text-xs text-slate-500">Analyze this call to generate a summary and QA evidence.</p>
    </div>
  );
}

function SummaryTab({
  detail,
  insights,
  hasAnalysis,
}: {
  detail: CallDetail;
  insights: AnalysisInsights | null;
  hasAnalysis: boolean;
}) {
  if (!hasAnalysis) {
    return <EmptyAnalysis />;
  }

  const confidence = formatConfidence(detail.analysisConfidence ?? insights?.confidence ?? null);
  const overall = formatScore(insights?.scoring?.overall);
  const outcome = insights?.callOutcome ?? null;
  const suggested = detail.suggestedDisposition ?? insights?.suggestedDisposition ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-200">{detail.analysisSummary ?? "No summary text."}</p>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {outcome && <Fact label="Outcome" value={outcome} />}
        {suggested && <Fact label="Suggested disposition" value={suggested} />}
        {confidence && <Fact label="Confidence" value={confidence} />}
        {overall && <Fact label="Quality score" value={overall} />}
      </dl>

      {insights?.customerIntent?.primaryIntent && (
        <Block label="Customer intent" body={insights.customerIntent.summary ?? insights.customerIntent.primaryIntent} />
      )}
      {insights?.agentQuality?.summary && (
        <Block
          label={`Agent quality${formatScore(insights.agentQuality.score) ? ` · ${formatScore(insights.agentQuality.score) ?? ""}` : ""}`}
          body={insights.agentQuality.summary}
        />
      )}
    </div>
  );
}

function DispositionTab({ insights }: { insights: AnalysisInsights | null }) {
  const d = insights?.disposition;
  const interest = insights?.customerIntent?.expressedInterest;

  // Pre-v3 analyses have no disposition block: prompt a re-analysis.
  if (!d && !interest) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-6 text-center">
        <p className="text-sm font-medium text-slate-300">Disposition intelligence isn’t available for this analysis.</p>
        <p className="mt-1 text-xs text-slate-500">
          Re-analyze this call to generate the final disposition, journey stage, qualification, conversion, fraud, and
          lead-quality read.
        </p>
      </div>
    );
  }

  const finalDisposition = humanizeToken(d?.finalDisposition);
  const journeyStage = humanizeToken(d?.journeyStageReached);
  const dispoConfidence = formatConfidence(d?.confidence);
  const qualification = d?.qualification;
  const conversion = d?.conversion;
  const fraud = d?.fraud;
  const leadQuality = d?.leadQuality;

  const interestLabel = interest
    ? [humanizeToken(interest.status), humanizeToken(interest.strength)].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="space-y-5">
      {/* What happened */}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {finalDisposition && <Fact label="Final disposition" value={finalDisposition} />}
        {journeyStage && <Fact label="Stage reached" value={journeyStage} />}
        {interestLabel && <Fact label="Interest" value={interestLabel} />}
        {dispoConfidence && <Fact label="Confidence" value={dispoConfidence} />}
      </dl>

      {/* Was it valuable — qualification */}
      {qualification && (humanizeToken(qualification.status) || (qualification.criteria?.length ?? 0) > 0) && (
        <DispoSection
          label="Qualification"
          pill={humanizeToken(qualification.status)}
          subPill={formatConfidence(qualification.confidence)}
        >
          {qualification.disqualificationReasons && qualification.disqualificationReasons.length > 0 && (
            <p className="text-xs text-slate-400">
              Disqualified: {qualification.disqualificationReasons.join("; ")}
            </p>
          )}
          {qualification.criteria && qualification.criteria.length > 0 && (
            <ul className="space-y-1.5">
              {qualification.criteria.map((c, i) => (
                <li key={`${c.key ?? "criterion"}-${String(i)}`} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-slate-300">
                    {c.label ?? humanizeToken(c.key) ?? "Criterion"}
                    {c.value ? <span className="text-slate-500"> — {c.value}</span> : null}
                  </span>
                  <span className="shrink-0 text-slate-500">{humanizeToken(c.status) ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </DispoSection>
      )}

      {/* Was it valuable — conversion */}
      {conversion && (humanizeToken(conversion.status) || humanizeToken(conversion.conversionType)) && (
        <DispoSection
          label="Conversion"
          pill={humanizeToken(conversion.status)}
          subPill={
            conversion.conversionType && conversion.conversionType !== "none"
              ? humanizeToken(conversion.conversionType)
              : null
          }
        >
          <Snippets items={conversion.evidence} />
          {conversion.followUp?.required && (
            <p className="text-xs text-slate-400">
              Follow-up: {humanizeToken(conversion.followUp.type) ?? "required"}
              {conversion.followUp.dueDateOrTimeMentioned ? ` · ${conversion.followUp.dueDateOrTimeMentioned}` : ""}
              {conversion.followUp.ownerMentioned ? ` · ${conversion.followUp.ownerMentioned}` : ""}
            </p>
          )}
        </DispoSection>
      )}

      {/* Was it risky — fraud */}
      {fraud && (humanizeToken(fraud.riskLevel) || (fraud.indicators?.length ?? 0) > 0) && (
        <DispoSection
          label="Fraud risk"
          pill={humanizeToken(fraud.riskLevel)}
          pillTone={fraudTone(fraud.riskLevel)}
          subPill={formatConfidence(fraud.confidence)}
        >
          {fraud.categories && fraud.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fraud.categories.map((cat, i) => (
                <span
                  key={`${cat}-${String(i)}`}
                  className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {humanizeToken(cat)}
                </span>
              ))}
            </div>
          )}
          {fraud.indicators && fraud.indicators.length > 0 && (
            <ul className="space-y-2">
              {fraud.indicators.map((ind, i) => (
                <li key={`${ind.type ?? "indicator"}-${String(i)}`} className="space-y-1">
                  <p className="text-xs font-medium text-slate-200">
                    {humanizeToken(ind.type) ?? "Indicator"}
                    {ind.severity ? <span className="text-slate-500"> · {ind.severity}</span> : null}
                  </p>
                  {ind.description && <p className="text-xs text-slate-400">{ind.description}</p>}
                  <Snippets items={ind.evidence} />
                </li>
              ))}
            </ul>
          )}
          {fraud.recommendedAction && fraud.recommendedAction !== "none" && (
            <p className="text-xs text-amber-200">Recommended: {humanizeToken(fraud.recommendedAction)}</p>
          )}
        </DispoSection>
      )}

      {/* Was it risky — lead quality (advisory) */}
      {leadQuality && humanizeToken(leadQuality.status) && (
        <DispoSection label="Lead quality" pill={humanizeToken(leadQuality.status)}>
          <p className="text-xs text-slate-400">
            {[
              leadQuality.billableRecommendation ? `Billing: ${humanizeToken(leadQuality.billableRecommendation)}` : null,
              leadQuality.payoutRecommendation ? `Payout: ${humanizeToken(leadQuality.payoutRecommendation)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Advisory only — not wired to billing."}
          </p>
          {leadQuality.reasons && leadQuality.reasons.length > 0 && (
            <ul className="space-y-1.5">
              {leadQuality.reasons.map((r, i) => (
                <li key={`${r.type ?? "reason"}-${String(i)}`} className="text-xs text-slate-300">
                  {humanizeToken(r.type) ?? "Reason"}
                  {r.summary ? <span className="text-slate-500"> — {r.summary}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </DispoSection>
      )}

      <p className="text-[10px] text-slate-600">
        AI-generated, evidence-based. Lead-quality and fraud recommendations are advisory and require human review.
      </p>
    </div>
  );
}

function DispoSection({
  label,
  pill,
  subPill,
  pillTone = "neutral",
  children,
}: {
  label: string;
  pill?: string | null;
  subPill?: string | null;
  pillTone?: "neutral" | "amber" | "rose" | "emerald";
  children?: React.ReactNode;
}) {
  const toneStyles: Record<"neutral" | "amber" | "rose" | "emerald", string> = {
    neutral: "border-slate-700 bg-slate-900 text-slate-200",
    amber: "border-amber-700/60 bg-amber-950/40 text-amber-200",
    rose: "border-rose-700/60 bg-rose-950/40 text-rose-200",
    emerald: "border-emerald-800/60 bg-emerald-950/40 text-emerald-200",
  };
  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <div className="flex items-center gap-1.5">
          {pill && (
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${toneStyles[pillTone]}`}>
              {pill}
            </span>
          )}
          {subPill && <span className="text-[11px] text-slate-500">{subPill}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Snippets({ items }: { items?: string[] }) {
  const quotes = (items ?? []).filter((s) => s.trim().length > 0);
  if (quotes.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {quotes.map((q, i) => (
        <li key={String(i)} className="border-l-2 border-slate-700 pl-2 text-xs italic text-slate-400">
          “{q}”
        </li>
      ))}
    </ul>
  );
}

function fraudTone(riskLevel: string | undefined): "neutral" | "amber" | "rose" | "emerald" {
  const normalized = (riskLevel ?? "").trim().toLowerCase();
  if (normalized === "critical" || normalized === "high") {
    return "rose";
  }
  if (normalized === "medium") {
    return "amber";
  }
  if (normalized === "none") {
    return "emerald";
  }
  return "neutral";
}

function FlagsTab({
  detail,
  actionMutation,
  openFlagCount,
  selectedFlagId,
  onSelectFlag,
  onJumpToFlag,
  onReplayFlag,
  onResolveFlag,
  onNewFlag,
}: {
  detail: CallDetail;
  actionMutation: UseMutationResult<void, Error, Record<string, unknown>, unknown>;
  openFlagCount: number;
  selectedFlagId: string | null;
  onSelectFlag: (id: string | null) => void;
  onJumpToFlag: (flag: CallFlagItem) => void;
  onReplayFlag: (flag: CallFlagItem) => void;
  onResolveFlag: (flag: CallFlagItem) => void;
  onNewFlag: () => void;
}) {
  const [severity, setSeverity] = React.useState<"all" | CallFlagItem["severity"]>("all");
  const [openOnly, setOpenOnly] = React.useState(false);

  const visible = detail.flags.filter((f) => {
    if (severity !== "all" && f.severity !== severity) {
      return false;
    }
    if (openOnly && f.status !== "open") {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{openFlagCount} open</span>
        <button
          type="button"
          onClick={onNewFlag}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
        >
          + New flag
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as "all" | CallFlagItem["severity"])}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
        >
          {SEVERITY_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All severities" : s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Open only
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">
          {detail.flags.length === 0 ? "No flags on this call." : "No flags match the current filter."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((flag) => (
            <div
              key={flag.id}
              className={`rounded-xl border px-3 py-3 space-y-2 ${
                selectedFlagId === flag.id
                  ? "border-violet-500/60 bg-violet-950/30"
                  : "border-slate-800 bg-slate-950/50"
              }`}
            >
              <button type="button" onClick={() => onSelectFlag(flag.id)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{flag.title}</p>
                  <SeverityBadge severity={flag.severity} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatFlagRange(flag)} · {flag.category} · {flag.status} · {flag.source}
                </p>
                {flag.description && <p className="mt-1 text-xs text-slate-400">{flag.description}</p>}
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
          ))}
        </div>
      )}
    </div>
  );
}

function NotesTab({
  detail,
  noteDraft,
  onNoteDraftChange,
  onSaveNoteAtTime,
  onDeleteNote,
  isNoteSaving,
  noteTextAreaRef,
}: {
  detail: CallDetail;
  noteDraft: string;
  onNoteDraftChange: (v: string) => void;
  onSaveNoteAtTime: () => void;
  onDeleteNote: (id: string) => void;
  isNoteSaving: boolean;
  noteTextAreaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {detail.reviewNotes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes yet.</p>
        ) : (
          detail.reviewNotes.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2 text-slate-500">
                <span className="font-mono">{formatTimestamp(n.startSeconds)}</span>
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
        Save note at playhead
      </button>
    </div>
  );
}

function QaTab({
  detail,
  insights,
  hasAnalysis,
  actionMutation,
}: {
  detail: CallDetail;
  insights: AnalysisInsights | null;
  hasAnalysis: boolean;
  actionMutation: UseMutationResult<void, Error, Record<string, unknown>, unknown>;
}) {
  const scoring = insights?.scoring;
  const complianceStatus = detail.complianceStatus ?? insights?.compliance?.status ?? null;
  const complianceSummary = detail.complianceSummary ?? insights?.compliance?.summary ?? null;

  return (
    <div className="space-y-5">
      {!hasAnalysis ? (
        <EmptyAnalysis />
      ) : (
        <div className="space-y-4">
          {scoring && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scoring</p>
              <ScoreBar label="Overall" value={scoring.overall} />
              <ScoreBar label="Compliance" value={scoring.compliance} />
              <ScoreBar label="Communication" value={scoring.communication} />
              <ScoreBar label="Outcome alignment" value={scoring.outcomeAlignment} />
            </div>
          )}

          {(complianceStatus ?? complianceSummary) && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <span className="font-semibold text-slate-400">Compliance</span>
              {complianceStatus ? ` (${complianceStatus})` : ""}
              {complianceSummary ? ` · ${complianceSummary}` : ""}
            </div>
          )}

          {insights?.followUpRecommendation && (
            <Block label="Follow-up recommendation" body={insights.followUpRecommendation} />
          )}

          {insights?.redactionsNeeded && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              Redactions needed before sharing this recording.
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-800 pt-4">
        <CallReviewActions
          detail={detail}
          isPending={actionMutation.isPending}
          onReviewStatus={(reviewStatus, reviewNotes, finalDisposition) =>
            actionMutation.mutate({ action: "review-status", reviewStatus, reviewNotes, finalDisposition })
          }
          onOverrideDisposition={(newDisposition, reason) =>
            actionMutation.mutate({ action: "override-disposition", newDisposition, reason })
          }
        />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | undefined }) {
  const display = formatScore(value);
  const pct = value != null && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-300">{display ?? "—"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${String(pct)}%` }} />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: CallFlagItem["severity"] }) {
  const styles: Record<CallFlagItem["severity"], string> = {
    critical: "border-rose-700/60 bg-rose-950/40 text-rose-200",
    high: "border-orange-700/60 bg-orange-950/40 text-orange-200",
    medium: "border-amber-700/60 bg-amber-950/40 text-amber-200",
    low: "border-slate-700 bg-slate-900 text-slate-300",
  };
  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${styles[severity]}`}>
      {severity}
    </span>
  );
}

function formatFlagRange(flag: CallFlagItem) {
  if (flag.startSeconds == null) {
    return "Time unknown";
  }
  if (flag.endSeconds == null) {
    return formatTimestamp(flag.startSeconds);
  }
  return `${formatTimestamp(flag.startSeconds)}–${formatTimestamp(flag.endSeconds)}`;
}
