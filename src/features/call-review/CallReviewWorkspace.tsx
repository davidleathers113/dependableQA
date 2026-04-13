import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import {
  getCallDetail,
  type CallAiMoment,
  type CallDetail,
  type CallFlagItem,
  type TranscriptSegment,
} from "../../lib/app-data";
import { useCallReviewMutation } from "../calls/useCallReviewMutation";
import { getActiveSegmentId } from "./activeSegment";
import { TranscriptPane } from "./TranscriptPane";
import { WaveformPanel } from "./WaveformPanel";
import { usePlaybackState } from "./usePlaybackState";
import { formatTimestamp } from "./formatTime";
import { CallReviewRightRail } from "./CallReviewRightRail";

interface Props {
  organizationId: string;
  callId: string;
  initialData: CallDetail | null;
}

async function fetchRecordingUrl(callId: string) {
  const response = await fetch(`/api/calls/${callId}/recording`);
  const payload = (await response.json().catch(() => ({}))) as { error?: string; url?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load recording.");
  }
  if (!payload.url) {
    throw new Error("Recording URL missing.");
  }
  return payload.url;
}

export function CallReviewWorkspace({ organizationId, callId, initialData }: Props) {
  const queryClient = useQueryClient();
  const transcriptScrollRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const noteInputRef = React.useRef<HTMLTextAreaElement>(null);

  const detailQuery = useQuery({
    queryKey: ["call-detail-page", organizationId, callId],
    queryFn: () => getCallDetail(getBrowserSupabase(), organizationId, callId),
    initialData: initialData ?? undefined,
  });

  const detail = detailQuery.data ?? null;

  const { actionMutation, errorMessage } = useCallReviewMutation({ organizationId, callId });

  const playback = usePlaybackState(detail?.durationSeconds ?? 0);

  const recordingQuery = useQuery({
    queryKey: ["call-recording-url", organizationId, callId],
    queryFn: () => fetchRecordingUrl(callId),
    enabled: Boolean(detail?.hasRecording && callId),
    staleTime: 50 * 60 * 1000,
    retry: 1,
  });

  React.useEffect(() => {
    const audio = playback.audioRef.current;
    const url = recordingQuery.data;
    if (!audio || !url) {
      return;
    }
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
  }, [playback.audioRef, recordingQuery.data]);

  const [transcriptQuery, setTranscriptQuery] = React.useState("");
  const [autoFollow, setAutoFollow] = React.useState(true);
  const [searchMatchIndex, setSearchMatchIndex] = React.useState(0);
  const [scrollRequest, setScrollRequest] = React.useState<{ segmentId: string; nonce: number } | null>(null);
  const [selectedFlagId, setSelectedFlagId] = React.useState<string | null>(null);
  const [mobileTab, setMobileTab] = React.useState<"transcript" | "review">("transcript");
  const deepLinkAppliedRef = React.useRef(false);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [flagDraft, setFlagDraft] = React.useState({
    title: "",
    flagCategory: "compliance",
    severity: "medium" as CallFlagItem["severity"],
    description: "",
  });

  const searchMatches = React.useMemo((): TranscriptSegment[] => {
    const q = transcriptQuery.trim().toLowerCase();
    if (!detail || q.length === 0) {
      return [];
    }
    return detail.transcriptSegments.filter((s: TranscriptSegment) => s.text.toLowerCase().includes(q));
  }, [detail, transcriptQuery]);

  React.useEffect(() => {
    if (searchMatches.length === 0) {
      setSearchMatchIndex(0);
      return;
    }
    if (searchMatchIndex >= searchMatches.length) {
      setSearchMatchIndex(0);
    }
  }, [searchMatches.length, searchMatchIndex]);

  const activeSegmentId = React.useMemo(() => {
    if (!detail) {
      return null;
    }
    return getActiveSegmentId(detail.transcriptSegments, playback.currentTime);
  }, [detail, playback.currentTime]);

  React.useEffect(() => {
    if (!detail || deepLinkAppliedRef.current) {
      return;
    }
    const url = new URL(window.location.href);
    const t = url.searchParams.get("t");
    if (t !== null) {
      const n = Number(t);
      if (Number.isFinite(n) && n >= 0) {
        playback.seek(n);
      }
    }
    const f = url.searchParams.get("flag");
    if (f && f.length > 0) {
      setSelectedFlagId(f);
    }
    deepLinkAppliedRef.current = true;
  }, [detail, playback]);

  const invalidateDetail = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["call-detail-page", organizationId, callId] });
    await queryClient.invalidateQueries({ queryKey: ["calls", organizationId] });
  }, [queryClient, organizationId, callId]);

  const createFlagMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/calls/${callId}/flags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to create flag.");
      }
    },
    onSuccess: async () => {
      await invalidateDetail();
      setFlagDraft((prev) => ({ ...prev, title: "", description: "" }));
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/calls/${callId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to save note.");
      }
    },
    onSuccess: async () => {
      await invalidateDetail();
      setNoteDraft("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await fetch(`/api/calls/${callId}/notes?noteId=${encodeURIComponent(noteId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to delete note.");
      }
    },
    onSuccess: async () => {
      await invalidateDetail();
    },
  });

  const onSeekToSegment = React.useCallback(
    (segment: TranscriptSegment) => {
      const start = segment.start ?? 0;
      playback.seek(start);
      setAutoFollow(true);
    },
    [playback]
  );

  const goToSearchHit = React.useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) {
        return;
      }
      const next = (searchMatchIndex + direction + searchMatches.length) % searchMatches.length;
      setSearchMatchIndex(next);
      const seg = searchMatches[next];
      if (!seg) {
        return;
      }
      const start = seg.start ?? 0;
      playback.seek(start);
      setScrollRequest({ segmentId: seg.id, nonce: Date.now() });
    },
    [searchMatches, searchMatchIndex, playback]
  );

  const onJumpToFlag = React.useCallback(
    (flag: CallFlagItem) => {
      const t = flag.startSeconds ?? 0;
      playback.seek(t);
      setSelectedFlagId(flag.id);
      if (!detail) {
        return;
      }
      let segmentId = detail.transcriptSegments[0]?.id ?? "";
      for (const seg of detail.transcriptSegments) {
        if (seg.start != null && seg.start <= t) {
          segmentId = seg.id;
        }
      }
      setScrollRequest({ segmentId, nonce: Date.now() });
    },
    [playback, detail]
  );

  const onReplayFlag = React.useCallback(
    (flag: CallFlagItem) => {
      const start = flag.startSeconds ?? 0;
      playback.seek(Math.max(0, start - 3));
    },
    [playback]
  );

  const onResolveFlag = React.useCallback(
    (flag: CallFlagItem) => {
      actionMutation.mutate({
        action: "flag-status",
        flagId: flag.id,
        status: "confirmed",
      });
    },
    [actionMutation]
  );

  const copyLink = React.useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("t", String(Math.floor(playback.currentTime)));
    if (selectedFlagId) {
      url.searchParams.set("flag", selectedFlagId);
    } else {
      url.searchParams.delete("flag");
    }
    void navigator.clipboard.writeText(url.toString());
  }, [playback.currentTime, selectedFlagId]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (e.code === "Space" && !typing) {
        e.preventDefault();
        playback.togglePlay();
        return;
      }

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "n" && !typing) {
        e.preventDefault();
        noteInputRef.current?.focus();
        return;
      }

      if (e.key === "f" && !typing) {
        e.preventDefault();
        setFlagDraft((prev) => ({ ...prev, title: prev.title || "Flag" }));
        return;
      }

      if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 2;
        playback.seekRelative(e.key === "ArrowLeft" ? -delta : delta);
        return;
      }

      if (!typing && (e.key === "[" || e.key === "]") && detail) {
        const open = detail.flags.filter((f: CallFlagItem) => f.status === "open");
        if (open.length === 0) {
          return;
        }
        e.preventDefault();
        const ix = open.findIndex((f: CallFlagItem) => f.id === selectedFlagId);
        const next =
          e.key === "["
            ? open[(ix <= 0 ? open.length : ix) - 1]
            : open[(ix + 1) % open.length];
        if (next) {
          setSelectedFlagId(next.id);
          onJumpToFlag(next);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback, detail, selectedFlagId, onJumpToFlag]);

  if (!detail) {
    return (
      <section className="space-y-6">
        <a href="/app/calls" className="text-sm text-violet-400 hover:text-violet-300">
          Back to calls
        </a>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Call not found.</div>
      </section>
    );
  }

  const signedUrl = recordingQuery.data ?? null;

  return (
    <section className="flex flex-col gap-4 pb-24 lg:pb-6">
      <audio ref={playback.audioRef} preload="metadata" className="hidden" crossOrigin="anonymous" />

      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div>
      )}

      <header className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/app/calls" className="text-xs text-violet-400 hover:text-violet-300">
              Back to calls
            </a>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Call review</p>
            <h1 className="text-xl font-semibold text-white">{detail.callerNumber}</h1>
            <p className="text-sm text-slate-400">
              {detail.campaignName ?? "No campaign"} · {detail.publisherName ?? "No publisher"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Copy link
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={playback.togglePlay}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            {playback.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => playback.seekRelative(-5)}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            -5s
          </button>
          <button
            type="button"
            onClick={() => playback.seekRelative(10)}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            +10s
          </button>
          <span className="font-mono text-sm text-slate-200">
            {formatTimestamp(playback.currentTime)} / {formatTimestamp(playback.duration || detail.durationSeconds)}
          </span>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span>Speed</span>
            <select
              value={playback.playbackRate}
              onChange={(e) => playback.setPlaybackRate(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span>Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={playback.volume}
              onChange={(e) => playback.setVolume(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={autoFollow}
              onChange={(e) => setAutoFollow(e.target.checked)}
            />
            Follow playback
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={searchInputRef}
            value={transcriptQuery}
            onChange={(e) => setTranscriptQuery(e.target.value)}
            placeholder="Search transcript (press /)"
            className="min-w-[200px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            onClick={() => goToSearchHit(-1)}
            disabled={searchMatches.length === 0}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Prev hit
          </button>
          <button
            type="button"
            onClick={() => goToSearchHit(1)}
            disabled={searchMatches.length === 0}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Next hit
          </button>
          <button
            type="button"
            onClick={() => setAutoFollow(true)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            Jump to playback
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,340px)] lg:gap-4 lg:items-start">
        <aside className="mb-4 hidden lg:block space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Jump</p>
            <ul className="mt-3 space-y-2 text-sm">
              {detail.aiMoments.slice(0, 12).map((m: CallAiMoment) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const t = m.start ?? 0;
                      playback.seek(t);
                      setScrollRequest({ segmentId: detail.transcriptSegments[0]?.id ?? "", nonce: Date.now() });
                    }}
                    className="w-full text-left text-xs text-violet-300 hover:text-violet-200"
                  >
                    {m.reason || m.text.slice(0, 48)}
                  </button>
                </li>
              ))}
              {detail.aiMoments.length === 0 && <li className="text-xs text-slate-500">No AI moments.</li>}
            </ul>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col gap-4">
          <WaveformPanel
            audioRef={playback.audioRef}
            signedUrl={signedUrl}
            durationSeconds={playback.duration || detail.durationSeconds}
            flags={detail.flags}
            onFlagRegionClick={(id) => {
              setSelectedFlagId(id);
              const flag = detail.flags.find((f: CallFlagItem) => f.id === id);
              if (flag && flag.startSeconds != null) {
                playback.seek(flag.startSeconds);
              }
            }}
          />
          {recordingQuery.isError && detail.hasRecording && (
            <p className="text-xs text-amber-300">
              Recording could not be loaded. Transcript review still works.
            </p>
          )}

          <div className="mb-2 flex gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("transcript")}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium ${
                mobileTab === "transcript" ? "bg-violet-600 text-white" : "border border-slate-700 text-slate-300"
              }`}
            >
              Transcript
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("review")}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium ${
                mobileTab === "review" ? "bg-violet-600 text-white" : "border border-slate-700 text-slate-300"
              }`}
            >
              Review
            </button>
          </div>

          <div className={mobileTab === "transcript" ? "block" : "hidden lg:block"}>
            <TranscriptPane
              segments={detail.transcriptSegments}
              searchQuery={transcriptQuery}
              activeSegmentId={activeSegmentId}
              autoFollow={autoFollow}
              onAutoFollowChange={setAutoFollow}
              onSeekToSegment={onSeekToSegment}
              scrollContainerRef={transcriptScrollRef}
              scrollRequest={scrollRequest}
            />
          </div>

          <div className={mobileTab === "review" ? "block lg:hidden" : "hidden"}>
            <CallReviewRightRail
              detail={detail}
              actionMutation={actionMutation}
              selectedFlagId={selectedFlagId}
              onSelectFlag={setSelectedFlagId}
              onJumpToFlag={onJumpToFlag}
              onReplayFlag={onReplayFlag}
              onResolveFlag={onResolveFlag}
              noteDraft={noteDraft}
              onNoteDraftChange={setNoteDraft}
              onSaveNoteAtTime={() => {
                noteMutation.mutate({
                  body: noteDraft.trim(),
                  startSeconds: playback.currentTime,
                });
              }}
              onDeleteNote={(id) => deleteNoteMutation.mutate(id)}
              isNoteSaving={noteMutation.isPending}
              flagDraft={flagDraft}
              onFlagDraftChange={setFlagDraft}
              onCreateManualFlag={() => {
                createFlagMutation.mutate({
                  flagCategory: flagDraft.flagCategory,
                  severity: flagDraft.severity,
                  title: flagDraft.title.trim(),
                  description: flagDraft.description.trim() || undefined,
                  startSeconds: playback.currentTime,
                  endSeconds: Math.min(playback.currentTime + 4, playback.duration || detail.durationSeconds),
                });
              }}
              isFlagSaving={createFlagMutation.isPending}
              noteTextAreaRef={noteInputRef}
            />
          </div>
        </div>

        <div className="hidden lg:block">
          <CallReviewRightRail
            detail={detail}
            actionMutation={actionMutation}
            selectedFlagId={selectedFlagId}
            onSelectFlag={setSelectedFlagId}
            onJumpToFlag={onJumpToFlag}
            onReplayFlag={onReplayFlag}
            onResolveFlag={onResolveFlag}
            noteDraft={noteDraft}
            onNoteDraftChange={setNoteDraft}
            onSaveNoteAtTime={() => {
              noteMutation.mutate({
                body: noteDraft.trim(),
                startSeconds: playback.currentTime,
              });
            }}
            onDeleteNote={(id) => deleteNoteMutation.mutate(id)}
            isNoteSaving={noteMutation.isPending}
            flagDraft={flagDraft}
            onFlagDraftChange={setFlagDraft}
            onCreateManualFlag={() => {
              createFlagMutation.mutate({
                flagCategory: flagDraft.flagCategory,
                severity: flagDraft.severity,
                title: flagDraft.title.trim(),
                description: flagDraft.description.trim() || undefined,
                startSeconds: playback.currentTime,
                endSeconds: Math.min(playback.currentTime + 4, playback.duration || detail.durationSeconds),
              });
            }}
            isFlagSaving={createFlagMutation.isPending}
            noteTextAreaRef={noteInputRef}
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/95 p-3 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <button
            type="button"
            onClick={playback.togglePlay}
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {playback.isPlaying ? "Pause" : "Play"}
          </button>
          <span className="font-mono text-xs text-slate-200">
            {formatTimestamp(playback.currentTime)} / {formatTimestamp(playback.duration || detail.durationSeconds)}
          </span>
          <button
            type="button"
            onClick={() => setMobileTab("review")}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200"
          >
            Review
          </button>
        </div>
      </div>
    </section>
  );
}
