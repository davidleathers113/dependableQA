import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDuration, getCallDetail } from "../../../lib/app-data";
import { getBrowserSupabase } from "../../../lib/supabase/browser-client";
import { getAiEmptyState, getAiStatusClassName, getAiStatusLabel } from "../ai-status";
import { CallReviewActions } from "./CallReviewActions";
import { useCallReviewMutation } from "../useCallReviewMutation";

interface Props {
  organizationId: string;
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CallDetailDrawer({ organizationId, callId, open, onOpenChange }: Props) {
  const [activeTab, setActiveTab] = React.useState<"overview" | "transcript" | "analysis" | "flags" | "audit">("overview");
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "transcript", label: "Transcript" },
    { id: "analysis", label: "Analysis" },
    { id: "flags", label: "Flags" },
    { id: "audit", label: "Audit" },
  ] as const;

  const detailQuery = useQuery({
    queryKey: ["call-detail", organizationId, callId],
    queryFn: () => getCallDetail(getBrowserSupabase(), organizationId, callId!),
    enabled: open && Boolean(callId),
  });

  const { actionMutation, errorMessage, clearErrorMessage } = useCallReviewMutation({
    organizationId,
    callId,
  });

  React.useEffect(() => {
    if (!open) {
      setActiveTab("overview");
      clearErrorMessage();
    }
  }, [clearErrorMessage, open]);

  if (!open || !callId) return null;

  const detail = detailQuery.data;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform transform translate-x-0">
        <div className="flex items-start justify-between border-b border-slate-800 bg-slate-900/70 px-6 py-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Quick Review Drawer</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Call Detail</h2>
            <p className="mt-1 text-xs font-mono text-slate-500">ID: {callId}</p>
          </div>
          <button
            className="rounded-lg border border-slate-800 p-2 text-slate-400 transition-colors hover:bg-slate-800"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        <div className="h-[calc(100vh-77px)] overflow-y-auto p-6">
          {detailQuery.isLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              Loading call details...
            </div>
          ) : !detail ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              Call details could not be loaded.
            </div>
          ) : (
            <>
              <div className="space-y-6">
              {errorMessage && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              )}

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold tracking-tight text-white">{detail.callerNumber}</h3>
                  <p className="text-sm text-slate-400">
                    {detail.campaignName ?? "No campaign"} / {detail.publisherName ?? "No publisher"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Review</p>
                    <p className="text-sm font-medium text-emerald-400">{detail.currentReviewStatus}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Source</p>
                    <p className="text-sm font-medium text-slate-200 uppercase">{detail.sourceProvider}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Started</p>
                    <p className="text-sm font-medium text-slate-200">{formatDateTime(detail.startedAt)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Duration</p>
                    <p className="text-sm font-medium text-slate-200">{formatDuration(detail.durationSeconds)}</p>
                  </div>
                </div>
              </section>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
                <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-950/20"
                        : "border border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                </div>
              </div>

              {activeTab === "overview" && (
                <section className="space-y-6">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">AI Summary</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${getAiStatusClassName(detail.transcriptionStatus)}`}>
                        Transcript: {getAiStatusLabel(detail.transcriptionStatus)}
                      </span>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${getAiStatusClassName(detail.analysisStatus)}`}>
                        Analysis: {getAiStatusLabel(detail.analysisStatus)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-300">
                      {detail.analysisSummary ?? getAiEmptyState("analysis", detail.analysisStatus, detail.analysisError)}
                    </p>
                    {detail.suggestedDisposition && (
                      <p className="mt-3 text-xs uppercase tracking-wider text-violet-400">
                        Suggested disposition: {detail.suggestedDisposition}
                      </p>
                    )}
                    {(detail.analysisError || detail.transcriptionError) && (
                      <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {detail.analysisError ?? detail.transcriptionError}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Disposition</p>
                      <p className="mt-1 text-sm text-slate-200">{detail.currentDisposition ?? "None"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Severity</p>
                      <p className="mt-1 text-sm text-slate-200">{detail.severitySummary ?? "No open severity summary"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Destination Number</p>
                      <p className="mt-1 text-sm text-slate-200">{detail.destinationNumber ?? "Unavailable"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Source Status</p>
                      <p className="mt-1 text-sm text-slate-200">{detail.sourceStatus}</p>
                    </div>
                  </div>

                  {detail.importBatchId && (
                    <a
                      href={`/app/imports/${detail.importBatchId}`}
                      className="inline-flex rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm font-medium text-violet-300 hover:bg-slate-800"
                    >
                      View Import Batch: {detail.importBatchFilename ?? detail.importBatchId.slice(0, 8)}
                    </a>
                  )}

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
              )}

              {activeTab === "transcript" && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300 space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Transcript</p>
                      <p className="mt-1 text-xs text-slate-500">Review the call evidence as captured.</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${getAiStatusClassName(detail.transcriptionStatus)}`}>
                      {getAiStatusLabel(detail.transcriptionStatus)}
                    </span>
                  </div>
                  {detail.transcriptSegments.length > 0 ? (
                    detail.transcriptSegments.map((segment, index) => (
                      <div key={`${segment.speaker}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{segment.speaker}</p>
                        <p className="mt-1 leading-6 text-slate-300">{segment.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="leading-6 text-slate-300">
                      {detail.transcriptText ?? getAiEmptyState("transcription", detail.transcriptionStatus, detail.transcriptionError)}
                    </p>
                  )}
                </section>
              )}

              {activeTab === "analysis" && (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Analysis Overview</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${getAiStatusClassName(detail.analysisStatus)}`}>
                        {getAiStatusLabel(detail.analysisStatus)}
                      </span>
                      <span>{formatDateTime(detail.analysisCreatedAt)}</span>
                    </div>
                    <p className="text-sm leading-6 text-slate-300">
                      {detail.analysisSummary ?? getAiEmptyState("analysis", detail.analysisStatus, detail.analysisError)}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Suggested Disposition</p>
                      <p className="mt-1 text-sm text-slate-200">{detail.suggestedDisposition ?? "Unavailable"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {detail.analysisConfidence !== null ? `${Number((detail.analysisConfidence * 100).toFixed(1))}%` : "Unavailable"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Model</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {detail.analysisModelName ?? "Unknown"} {detail.analysisVersion ? `(${detail.analysisVersion})` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Structured Output</p>
                    <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6 text-slate-300">
                      {detail.analysisStructuredOutput ? JSON.stringify(detail.analysisStructuredOutput, null, 2) : "No structured output stored."}
                    </pre>
                  </div>
                </section>
              )}

              {activeTab === "flags" && (
                <section className="space-y-4">
                  {detail.flags.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-500">
                      No flags have been raised for this call.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detail.flags.map((flag) => (
                        <div key={flag.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-white">{flag.title}</p>
                              <p className="mt-1 text-sm text-slate-400">{flag.description ?? "No additional context provided."}</p>
                              {flag.evidenceSummary.length > 0 && (
                                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                                  {flag.evidenceSummary.map((entry) => (
                                    <li key={entry}>{entry}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-300">
                              {flag.severity} / {flag.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                            <button
                              type="button"
                              disabled={actionMutation.isPending || flag.status === "confirmed"}
                              onClick={() =>
                                actionMutation.mutate({
                                  action: "flag-status",
                                  flagId: flag.id,
                                  status: "confirmed",
                                })
                              }
                              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                            >
                              Confirm Flag
                            </button>
                            <button
                              type="button"
                              disabled={actionMutation.isPending || flag.status === "dismissed"}
                              onClick={() =>
                                actionMutation.mutate({
                                  action: "flag-status",
                                  flagId: flag.id,
                                  status: "dismissed",
                                })
                              }
                              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                            >
                              Dismiss Flag
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === "audit" && (
                <section className="space-y-4">
                  {detail.history.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-500">
                      No history entries have been recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative before:absolute before:bottom-5 before:left-7 before:top-5 before:w-px before:bg-slate-800">
                      {detail.history.map((item) => (
                        <div key={item.id} className="relative pl-10">
                          <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-slate-950 bg-slate-900 ring-2 ring-slate-800"></div>
                          <p className="text-xs text-slate-500 font-medium">{formatDateTime(item.createdAt)}</p>
                          <p className="text-sm text-slate-300">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <a
                href={`/app/calls/${detail.id}`}
                className="inline-flex rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Open Full Page
              </a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
