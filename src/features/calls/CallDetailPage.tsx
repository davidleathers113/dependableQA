import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { formatDuration, getCallDetail, type CallDetail } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { CallReviewActions } from "./components/CallReviewActions";
import { useCallReviewMutation } from "./useCallReviewMutation";

interface Props {
  organizationId: string;
  callId: string;
  initialData: CallDetail | null;
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

function CallDetailPageInner({ organizationId, callId, initialData }: Props) {
  const [transcriptQuery, setTranscriptQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<"overview" | "transcript" | "analysis" | "flags" | "audit">("overview");
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "transcript", label: "Transcript" },
    { id: "analysis", label: "Analysis" },
    { id: "flags", label: "Flags" },
    { id: "audit", label: "Audit" },
  ] as const;
  const detailQuery = useQuery({
    queryKey: ["call-detail-page", organizationId, callId],
    queryFn: () => getCallDetail(getBrowserSupabase(), organizationId, callId),
    initialData,
  });
  const { actionMutation, errorMessage } = useCallReviewMutation({
    organizationId,
    callId,
  });

  const detail = detailQuery.data;

  const transcriptSegments =
    detail?.transcriptSegments.filter((segment) =>
      transcriptQuery.trim()
        ? segment.text.toLowerCase().includes(transcriptQuery.trim().toLowerCase())
        : true
    ) ?? [];

  if (!detail) {
    return (
      <section className="space-y-6">
        <a href="/app/calls" className="text-sm text-violet-400 hover:text-violet-300">
          Back to calls
        </a>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
          Call not found.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <a href="/app/calls" className="text-sm text-violet-400 hover:text-violet-300">
        Back to calls
      </a>

      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Call Detail</p>
            <h1 className="text-2xl font-semibold text-white">{detail.callerNumber}</h1>
            <p className="text-sm text-slate-400">
              {detail.campaignName ?? "No campaign"} / {detail.publisherName ?? "No publisher"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Started</p>
              <p className="mt-1 text-sm text-slate-200">{formatDateTime(detail.startedAt)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Duration</p>
              <p className="mt-1 text-sm text-slate-200">{formatDuration(detail.durationSeconds)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Disposition</p>
              <p className="mt-1 text-sm text-slate-200">{detail.currentDisposition ?? "None"}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Severity</p>
              <p className="mt-1 text-sm text-slate-200">{detail.severitySummary ?? "No active severity summary"}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4 xl:sticky xl:top-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Summary</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Operational Context</h2>
            </div>
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Review Status</p>
                <p className="mt-1 text-sm text-slate-200">{detail.currentReviewStatus}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Source</p>
                <p className="mt-1 text-sm text-slate-200 uppercase">{detail.sourceProvider}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Source Status</p>
                <p className="mt-1 text-sm text-slate-200">{detail.sourceStatus}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Destination Number</p>
                <p className="mt-1 text-sm text-slate-200">{detail.destinationNumber ?? "Unavailable"}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Top Flag</p>
                <p className="mt-1 text-sm text-slate-200">{detail.topFlag ?? "No top flag"}</p>
              </div>
              {detail.importBatchId && (
                <a
                  href={`/app/imports/${detail.importBatchId}`}
                  className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-violet-300 hover:bg-slate-800"
                >
                  Import Batch: {detail.importBatchFilename ?? detail.importBatchId.slice(0, 8)}
                </a>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
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

        <div className="space-y-6">
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
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Overview</p>
                <h2 className="mt-1 text-lg font-semibold text-white">AI Summary And Reviewer Context</h2>
              </div>
              <p className="text-sm leading-6 text-slate-300">
                {detail.analysisSummary ?? "No AI analysis has been stored yet."}
              </p>
              {detail.suggestedDisposition && (
                <p className="text-xs uppercase tracking-wider text-violet-400">
                  Suggested disposition: {detail.suggestedDisposition}
                </p>
              )}
              {detail.latestReviewNotes && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Latest Review Note</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{detail.latestReviewNotes}</p>
                </div>
              )}
            </section>
          )}

          {activeTab === "transcript" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Transcript</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Evidence Review</h2>
                </div>
                <input
                  value={transcriptQuery}
                  onChange={(event) => setTranscriptQuery(event.target.value)}
                  placeholder="Search transcript..."
                  className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="space-y-4">
                {detail.transcriptSegments.length > 0 ? (
                  transcriptSegments.map((segment, index) => (
                    <div key={`${segment.speaker}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">{segment.speaker}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{segment.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
                    {detail.transcriptText ?? "No transcript is available for this call."}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === "analysis" && (
            <section className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Analysis</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Model Output</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Suggested Disposition</p>
                  <p className="mt-1 text-sm text-slate-200">{detail.suggestedDisposition ?? "Unavailable"}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {detail.analysisConfidence !== null ? `${Number((detail.analysisConfidence * 100).toFixed(1))}%` : "Unavailable"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Model</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {detail.analysisModelName ?? "Unknown"} {detail.analysisVersion ? `(${detail.analysisVersion})` : ""}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Structured Output</p>
                <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6 text-slate-300">
                  {detail.analysisStructuredOutput ? JSON.stringify(detail.analysisStructuredOutput, null, 2) : "No structured output stored."}
                </pre>
              </div>
            </section>
          )}

          {activeTab === "flags" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Flags</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Risk And Compliance Actions</h2>
              </div>
              {detail.flags.length === 0 ? (
                <p className="text-sm text-slate-500">No flags raised for this call.</p>
              ) : (
                detail.flags.map((flag) => (
                  <div key={flag.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
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
                      <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-300">
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
                ))
              )}
            </section>
          )}

          {activeTab === "audit" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Audit</p>
                <h2 className="mt-1 text-lg font-semibold text-white">History</h2>
              </div>
              {detail.history.length === 0 ? (
                <p className="text-sm text-slate-500">No audit history yet.</p>
              ) : (
                <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  {detail.history.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                      <p className="text-xs uppercase tracking-wider text-slate-500">{formatDateTime(item.createdAt)}</p>
                      <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

export default function CallDetailPage(props: Props) {
  return (
    <QueryProvider>
      <CallDetailPageInner {...props} />
    </QueryProvider>
  );
}
