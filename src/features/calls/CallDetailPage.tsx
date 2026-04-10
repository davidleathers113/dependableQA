import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { formatDuration, getCallDetail, type CallDetail } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

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
  const detailQuery = useQuery({
    queryKey: ["call-detail-page", organizationId, callId],
    queryFn: () => getCallDetail(getBrowserSupabase(), organizationId, callId),
    initialData,
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

      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white">{detail.callerNumber}</h1>
            <p className="text-sm text-slate-400">
              {detail.campaignName ?? "No campaign"} / {detail.publisherName ?? "No publisher"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
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
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">Transcript</h2>
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

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">AI Summary</h2>
            <p className="text-sm leading-6 text-slate-300">
              {detail.analysisSummary ?? "No AI analysis has been stored yet."}
            </p>
            {detail.suggestedDisposition && (
              <p className="text-xs uppercase tracking-wider text-violet-400">
                Suggested disposition: {detail.suggestedDisposition}
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Flags</h2>
            {detail.flags.length === 0 ? (
              <p className="text-sm text-slate-500">No flags raised for this call.</p>
            ) : (
              detail.flags.map((flag) => (
                <div key={flag.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{flag.title}</p>
                      <p className="mt-1 text-sm text-slate-400">{flag.description ?? "No additional context provided."}</p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-300">
                      {flag.severity} / {flag.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">History</h2>
            {detail.history.length === 0 ? (
              <p className="text-sm text-slate-500">No audit history yet.</p>
            ) : (
              detail.history.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                  <p className="text-xs uppercase tracking-wider text-slate-500">{formatDateTime(item.createdAt)}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                </div>
              ))
            )}
          </section>
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
