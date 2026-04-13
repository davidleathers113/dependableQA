import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TranscriptSegment } from "../../lib/app-data";
import { findAllMatchPositions, splitTextByRanges } from "./searchHelpers";
import { formatTimestamp } from "./formatTime";

interface Props {
  segments: TranscriptSegment[];
  searchQuery: string;
  activeSegmentId: string | null;
  autoFollow: boolean;
  onAutoFollowChange: (next: boolean) => void;
  onSeekToSegment: (segment: TranscriptSegment) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scrollRequest: { segmentId: string; nonce: number } | null;
}

export function TranscriptPane({
  segments,
  searchQuery,
  activeSegmentId,
  autoFollow,
  onAutoFollowChange,
  onSeekToSegment,
  scrollContainerRef,
  scrollRequest,
}: Props) {
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 88,
    overscan: 8,
  });

  const segmentRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  React.useEffect(() => {
    if (!autoFollow || !activeSegmentId) {
      return;
    }
    const el = segmentRefs.current.get(activeSegmentId);
    if (!el) {
      return;
    }
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [activeSegmentId, autoFollow, segments]);

  React.useEffect(() => {
    if (!scrollRequest) {
      return;
    }
    const el = segmentRefs.current.get(scrollRequest.segmentId);
    if (!el) {
      return;
    }
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [scrollRequest]);

  const onScrollContainer = () => {
    if (autoFollow) {
      onAutoFollowChange(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-950/30">
      <div
        ref={scrollContainerRef}
        onScroll={onScrollContainer}
        className="min-h-[280px] flex-1 overflow-y-auto px-2 py-3 lg:min-h-[420px]"
      >
        <div
          style={{
            height: `${String(virtualizer.getTotalSize())}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const segment = segments[virtualRow.index];
            if (!segment) {
              return null;
            }

            const isActive = segment.id === activeSegmentId;
            const q = searchQuery.trim();
            let ranges: Array<{ start: number; end: number }> = [];
            if (q.length > 0) {
              ranges = findAllMatchPositions(segment.text, q);
            }

            const parts = splitTextByRanges(segment.text, ranges);

            return (
              <div
                key={segment.id}
                ref={(node) => {
                  if (node) {
                    segmentRefs.current.set(segment.id, node);
                  } else {
                    segmentRefs.current.delete(segment.id);
                  }
                }}
                data-segment-id={segment.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${String(virtualRow.start)}px)`,
                }}
                className="px-2 pb-2"
              >
                <button
                  type="button"
                  onClick={() => onSeekToSegment(segment)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-violet-500/60 bg-violet-950/40"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[10px] text-slate-500">
                      {segment.start != null ? formatTimestamp(segment.start) : "—"}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {segment.speaker}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    {parts.map((part, i) =>
                      part.type === "hit" ? (
                        <mark
                          key={`${segment.id}-p-${String(i)}`}
                          className="bg-amber-500/25 text-amber-50"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={`${segment.id}-p-${String(i)}`}>{part.text}</span>
                      )
                    )}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
