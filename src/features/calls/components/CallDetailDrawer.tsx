import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDuration, getCallDetail } from "../../../lib/app-data";
import { getBrowserSupabase } from "../../../lib/supabase/browser-client";

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

async function postReviewAction(callId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/calls/${callId}/review`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to update call.");
  }
}

export function CallDetailDrawer({ organizationId, callId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [overrideValue, setOverrideValue] = React.useState("");
  const [overrideReason, setOverrideReason] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");

  const detailQuery = useQuery({
    queryKey: ["call-detail", organizationId, callId],
    queryFn: () => getCallDetail(getBrowserSupabase(), organizationId, callId!),
    enabled: open && Boolean(callId),
  });

  React.useEffect(() => {
    if (!open) {
      setOverrideValue("");
      setOverrideReason("");
      setErrorMessage("");
    }
  }, [open]);

  const actionMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!callId) {
        throw new Error("Missing call identifier.");
      }

      await postReviewAction(callId, body);
    },
    onSuccess: async () => {
      setErrorMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calls", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["call-detail", organizationId, callId] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update call.");
    },
  });

  if (!open || !callId) return null;

  const detail = detailQuery.data;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform transform translate-x-0">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Call Detail</h2>
            <p className="text-xs font-mono text-slate-500">ID: {callId}</p>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        <div className="h-[calc(100vh-65px)] overflow-y-auto p-6 space-y-8">
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
          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}

          <section className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</p>
              <p className="text-sm font-medium text-emerald-400">{detail.currentReviewStatus}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Source</p>
              <p className="text-sm font-medium text-slate-200 uppercase">{detail.sourceProvider}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Started</p>
              <p className="text-sm font-medium text-slate-200">{formatDateTime(detail.startedAt)}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Duration</p>
              <p className="text-sm font-medium text-slate-200">{formatDuration(detail.durationSeconds)}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <span>📝</span>
              <span>AI Analysis Summary</span>
            </h3>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <p className="text-sm text-slate-400 leading-relaxed">
                {detail.analysisSummary ?? "No AI analysis has been stored for this call yet."}
              </p>
              {detail.suggestedDisposition && (
                <p className="mt-4 text-xs uppercase tracking-wider text-violet-400">
                  Suggested disposition: {detail.suggestedDisposition}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Operational Actions</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() =>
                  actionMutation.mutate({
                    action: "review-status",
                    reviewStatus: "reviewed",
                    finalDisposition: detail.currentDisposition ?? "Reviewed",
                  })
                }
                className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/10 disabled:opacity-60"
              >
                Confirm Disposition
              </button>
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() =>
                  actionMutation.mutate({
                    action: "review-status",
                    reviewStatus: "in_review",
                  })
                }
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                Mark In Review
              </button>
              <button
                type="button"
                disabled={actionMutation.isPending || detail.flags.length === 0}
                onClick={() => {
                  const firstOpenFlag = detail.flags.find((flag) => flag.status === "open");
                  if (firstOpenFlag) {
                    actionMutation.mutate({
                      action: "flag-status",
                      flagId: firstOpenFlag.id,
                      status: "dismissed",
                    });
                  }
                }}
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                Dismiss First Open Flag
              </button>
              <a
                href={`/app/calls/${detail.id}`}
                className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Open Full Page
              </a>
            </div>

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
                placeholder="Reason for override"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                disabled={actionMutation.isPending || !overrideValue.trim() || !overrideReason.trim()}
                onClick={() =>
                  actionMutation.mutate({
                    action: "override-disposition",
                    newDisposition: overrideValue,
                    reason: overrideReason,
                  })
                }
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                Override
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Transcript</h3>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300 space-y-3">
              {detail.transcriptSegments.length > 0 ? (
                detail.transcriptSegments.map((segment, index) => (
                  <div key={`${segment.speaker}-${index}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{segment.speaker}</p>
                    <p className="mt-1 leading-6 text-slate-300">{segment.text}</p>
                  </div>
                ))
              ) : (
                <p className="leading-6 text-slate-300">
                  {detail.transcriptText ?? "No transcript captured for this call."}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Flags</h3>
            {detail.flags.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-500">
                No flags have been raised for this call.
              </div>
            ) : (
              <div className="space-y-3">
                {detail.flags.map((flag) => (
                  <div key={flag.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{flag.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{flag.description ?? "No additional context provided."}</p>
                      </div>
                      <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-300">
                        {flag.severity} / {flag.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
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
                        Confirm
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
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">History</h3>
            {detail.history.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-500">
                No history entries have been recorded yet.
              </div>
            ) : (
              <div className="space-y-4 relative before:absolute before:inset-0 before:left-2 before:w-0.5 before:bg-slate-800">
                {detail.history.map((item) => (
                  <div key={item.id} className="relative pl-8">
                    <div className="absolute left-0 top-1.5 h-4.5 w-4.5 rounded-full border-4 border-slate-950 bg-slate-900 ring-2 ring-slate-800"></div>
                    <p className="text-xs text-slate-500 font-medium">{formatDateTime(item.createdAt)}</p>
                    <p className="text-sm text-slate-300">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
