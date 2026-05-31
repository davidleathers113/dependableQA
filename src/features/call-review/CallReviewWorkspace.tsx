import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import {
  getCallDetail,
  type CallDetail,
  type CallFlagItem,
} from "../../lib/app-data";
import { useCallReviewMutation } from "../calls/useCallReviewMutation";
import { getActiveSegmentId } from "./activeSegment";
import { groupTranscriptSegments, type TranscriptRow } from "./groupTranscriptSegments";
import { TranscriptView, type TranscriptMode } from "./TranscriptView";
import { WaveformPanel } from "./WaveformPanel";
import { usePlaybackState } from "./usePlaybackState";
import { formatTimestamp } from "./formatTime";
import { QaPanel, type QaTab } from "./QaPanel";
import { CallOutline } from "./CallOutline";
import { FlagDrawer, type FlagAnchor, type FlagDraft } from "./FlagDrawer";

interface Props {
  organizationId: string;
  callId: string;
  initialData: CallDetail | null;
}

const MODE_STORAGE_KEY = "dependableqa:transcript-mode";
const TRANSCRIPT_MODES: TranscriptMode[] = ["compact", "conversation", "raw"];

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
  const [scrollRequest, setScrollRequest] = React.useState<{ rowId: string; nonce: number } | null>(null);
  const [selectedFlagId, setSelectedFlagId] = React.useState<string | null>(null);
  const [mobileTab, setMobileTab] = React.useState<"transcript" | "review">("transcript");
  const [qaTab, setQaTab] = React.useState<QaTab>("summary");
  // When a call loads with open flags, surface them first instead of the
  // summary tab — operational visibility for reviewers. Keyed on callId so it
  // runs once per call and never overrides a later manual tab change.
  const autoFlagTabCallIdRef = React.useRef<string | null>(null);
  // Initialized to "compact" on first render (matches SSR) and hydrated from
  // localStorage in an effect to avoid a hydration mismatch.
  const [mode, setMode] = React.useState<TranscriptMode>("compact");
  const [flagDrawerOpen, setFlagDrawerOpen] = React.useState(false);
  const [flagAnchor, setFlagAnchor] = React.useState<FlagAnchor | null>(null);
  const deepLinkAppliedRef = React.useRef(false);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [flagDraft, setFlagDraft] = React.useState<FlagDraft>({
    title: "",
    flagCategory: "compliance",
    severity: "medium",
    description: "",
  });

  React.useEffect(() => {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "compact" || saved === "conversation" || saved === "raw") {
      setMode(saved);
    }
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  React.useEffect(() => {
    if (!detail) {
      return;
    }
    if (autoFlagTabCallIdRef.current === callId) {
      return;
    }
    autoFlagTabCallIdRef.current = callId;
    if (detail.flags.some((f) => f.status === "open")) {
      setQaTab("flags");
    }
  }, [detail, callId]);

  const turns = React.useMemo(
    () => (detail ? groupTranscriptSegments(detail.transcriptSegments) : []),
    [detail]
  );

  // Rows the view renders and the workspace operates on. Raw mode uses original
  // ASR segments; compact/conversation use grouped turns. Both satisfy
  // TranscriptRow, so seek/active/search share one code path.
  const rows = React.useMemo<TranscriptRow[]>(
    () => (mode === "raw" && detail ? detail.transcriptSegments : turns),
    [mode, detail, turns]
  );

  const findRowIdAtTime = React.useCallback(
    (time: number) => {
      let rowId = rows[0]?.id ?? "";
      for (const row of rows) {
        if (row.start != null && row.start <= time) {
          rowId = row.id;
        }
      }
      return rowId;
    },
    [rows]
  );

  const searchMatches = React.useMemo((): TranscriptRow[] => {
    const q = transcriptQuery.trim().toLowerCase();
    if (q.length === 0) {
      return [];
    }
    return rows.filter((row) => row.text.toLowerCase().includes(q));
  }, [rows, transcriptQuery]);

  React.useEffect(() => {
    if (searchMatches.length === 0) {
      setSearchMatchIndex(0);
      return;
    }
    if (searchMatchIndex >= searchMatches.length) {
      setSearchMatchIndex(0);
    }
  }, [searchMatches.length, searchMatchIndex]);

  const activeRowId = React.useMemo(
    () => getActiveSegmentId(rows, playback.currentTime),
    [rows, playback.currentTime]
  );

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
      setFlagDrawerOpen(false);
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

  const durationSeconds = playback.duration || (detail?.durationSeconds ?? 0);

  const onSeekToRow = React.useCallback(
    (row: TranscriptRow) => {
      playback.seek(row.start ?? 0);
      setAutoFollow(true);
    },
    [playback]
  );

  const openFlagDrawerAtPlayhead = React.useCallback(() => {
    const start = playback.currentTime;
    setFlagAnchor({
      startSeconds: start,
      endSeconds: durationSeconds > 0 ? Math.min(start + 4, durationSeconds) : start + 4,
      excerpt: null,
      source: "playhead",
    });
    setFlagDrawerOpen(true);
  }, [playback, durationSeconds]);

  const onFlagRow = React.useCallback(
    (row: TranscriptRow) => {
      const start = row.start ?? playback.currentTime;
      const end = row.end ?? (durationSeconds > 0 ? Math.min(start + 4, durationSeconds) : start + 4);
      setFlagAnchor({ startSeconds: start, endSeconds: end, excerpt: row.text, source: "transcript" });
      setFlagDrawerOpen(true);
    },
    [playback, durationSeconds]
  );

  const onNoteRow = React.useCallback(
    (row: TranscriptRow) => {
      if (row.start != null) {
        playback.seek(row.start);
      }
      setQaTab("notes");
      setMobileTab("review");
      window.setTimeout(() => noteInputRef.current?.focus(), 50);
    },
    [playback]
  );

  const submitFlag = React.useCallback(() => {
    if (!flagAnchor) {
      return;
    }
    const base = flagDraft.description.trim();
    const description =
      flagAnchor.source === "transcript" && flagAnchor.excerpt
        ? [base, `“${flagAnchor.excerpt}”`].filter((s) => s.length > 0).join("\n\n")
        : base;
    createFlagMutation.mutate({
      flagCategory: flagDraft.flagCategory,
      severity: flagDraft.severity,
      title: flagDraft.title.trim(),
      description: description.length > 0 ? description : undefined,
      startSeconds: flagAnchor.startSeconds,
      endSeconds: flagAnchor.endSeconds ?? undefined,
    });
  }, [flagAnchor, flagDraft, createFlagMutation]);

  const goToSearchHit = React.useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) {
        return;
      }
      const next = (searchMatchIndex + direction + searchMatches.length) % searchMatches.length;
      setSearchMatchIndex(next);
      const row = searchMatches[next];
      if (!row) {
        return;
      }
      playback.seek(row.start ?? 0);
      setScrollRequest({ rowId: row.id, nonce: Date.now() });
    },
    [searchMatches, searchMatchIndex, playback]
  );

  const focusFlag = React.useCallback((id: string) => {
    setSelectedFlagId(id);
    setQaTab("flags");
    setMobileTab("review");
  }, []);

  const onJumpToFlag = React.useCallback(
    (flag: CallFlagItem) => {
      const t = flag.startSeconds ?? 0;
      playback.seek(t);
      focusFlag(flag.id);
      setScrollRequest({ rowId: findRowIdAtTime(t), nonce: Date.now() });
    },
    [playback, focusFlag, findRowIdAtTime]
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
      actionMutation.mutate({ action: "flag-status", flagId: flag.id, status: "confirmed" });
    },
    [actionMutation]
  );

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
      focusFlag(f);
    }
    deepLinkAppliedRef.current = true;
  }, [detail, playback, focusFlag]);

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

      if (e.key === "Escape" && flagDrawerOpen) {
        return; // handled inside the drawer
      }

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
        setQaTab("notes");
        setMobileTab("review");
        window.setTimeout(() => noteInputRef.current?.focus(), 50);
        return;
      }

      if (e.key === "f" && !typing) {
        e.preventDefault();
        openFlagDrawerAtPlayhead();
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
        const next = e.key === "[" ? open[(ix <= 0 ? open.length : ix) - 1] : open[(ix + 1) % open.length];
        if (next) {
          onJumpToFlag(next);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback, detail, selectedFlagId, onJumpToFlag, openFlagDrawerAtPlayhead, flagDrawerOpen]);

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

  const qaPanelProps = {
    detail,
    actionMutation,
    tab: qaTab,
    onTabChange: setQaTab,
    selectedFlagId,
    onSelectFlag: setSelectedFlagId,
    onJumpToFlag,
    onReplayFlag,
    onResolveFlag,
    onNewFlag: openFlagDrawerAtPlayhead,
    noteDraft,
    onNoteDraftChange: setNoteDraft,
    onSaveNoteAtTime: () => {
      noteMutation.mutate({ body: noteDraft.trim(), startSeconds: playback.currentTime });
    },
    onDeleteNote: (id: string) => deleteNoteMutation.mutate(id),
    isNoteSaving: noteMutation.isPending,
    noteTextAreaRef: noteInputRef,
  };

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
            {formatTimestamp(playback.currentTime)} / {formatTimestamp(durationSeconds)}
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
            <input type="checkbox" checked={autoFollow} onChange={(e) => setAutoFollow(e.target.checked)} />
            Follow playback
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={searchInputRef}
            value={transcriptQuery}
            onChange={(e) => setTranscriptQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goToSearchHit(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Search transcript (press /)"
            className="min-w-[200px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
          />
          <span className="min-w-[3.5rem] text-center font-mono text-xs text-slate-400">
            {transcriptQuery.trim().length === 0
              ? ""
              : searchMatches.length === 0
                ? "0/0"
                : `${String(searchMatchIndex + 1)}/${String(searchMatches.length)}`}
          </span>
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

      <div className="lg:grid lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,360px)] lg:gap-4 lg:items-start">
        <aside className="mb-4 hidden lg:block lg:sticky lg:top-4">
          <CallOutline
            moments={detail.aiMoments}
            currentTime={playback.currentTime}
            onJumpToMoment={(m) => {
              const t = m.start ?? 0;
              playback.seek(t);
              setAutoFollow(true);
              setScrollRequest({ rowId: findRowIdAtTime(t), nonce: Date.now() });
            }}
          />
        </aside>

        <div className="flex min-h-0 flex-col gap-4">
          <WaveformPanel
            audioRef={playback.audioRef}
            signedUrl={signedUrl}
            durationSeconds={durationSeconds}
            flags={detail.flags}
            onFlagRegionClick={(id) => {
              focusFlag(id);
              const flag = detail.flags.find((f: CallFlagItem) => f.id === id);
              if (flag && flag.startSeconds != null) {
                playback.seek(flag.startSeconds);
              }
            }}
          />
          {recordingQuery.isLoading && detail.hasRecording && (
            <p className="text-xs text-slate-400">Loading recording…</p>
          )}
          {recordingQuery.isError && detail.hasRecording && (
            <p className="text-xs text-amber-300">
              Recording source unavailable or expired. Transcript review still works.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">View</span>
              <div className="inline-flex rounded-lg border border-slate-700 p-0.5">
                {TRANSCRIPT_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      mode === m ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
            <TranscriptView
              mode={mode}
              rows={rows}
              searchQuery={transcriptQuery}
              activeRowId={activeRowId}
              autoFollow={autoFollow}
              onAutoFollowChange={setAutoFollow}
              onSeekToRow={onSeekToRow}
              onFlagRow={onFlagRow}
              onNoteRow={onNoteRow}
              scrollContainerRef={transcriptScrollRef}
              scrollRequest={scrollRequest}
            />
          </div>

          <div className={mobileTab === "review" ? "block lg:hidden" : "hidden"}>
            <QaPanel {...qaPanelProps} />
          </div>
        </div>

        <div className="hidden lg:block lg:sticky lg:top-4">
          <QaPanel {...qaPanelProps} />
        </div>
      </div>

      <FlagDrawer
        open={flagDrawerOpen}
        anchor={flagAnchor}
        draft={flagDraft}
        onDraftChange={setFlagDraft}
        onClose={() => setFlagDrawerOpen(false)}
        onSubmit={submitFlag}
        isSaving={createFlagMutation.isPending}
      />

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
            {formatTimestamp(playback.currentTime)} / {formatTimestamp(durationSeconds)}
          </span>
          <button
            type="button"
            onClick={() => setMobileTab((t) => (t === "review" ? "transcript" : "review"))}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200"
          >
            {mobileTab === "review" ? "Transcript" : "Review"}
          </button>
        </div>
      </div>
    </section>
  );
}
