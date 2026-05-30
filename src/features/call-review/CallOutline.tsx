import * as React from "react";
import type { CallAiMoment } from "../../lib/app-data";
import { formatTimestamp } from "./formatTime";

interface Props {
  moments: CallAiMoment[];
  currentTime: number;
  onJumpToMoment: (moment: CallAiMoment) => void;
}

/**
 * Left-rail call outline derived from AI evidence moments. Lets a reviewer jump
 * around a long call without reading everything. Highlights the section that
 * corresponds to the current playback time. Stays out of the way (small empty
 * state) when there is no analysis yet.
 */
export function CallOutline({ moments, currentTime, onJumpToMoment }: Props) {
  const timed = React.useMemo(
    () => moments.filter((m) => m.start != null).sort((a, b) => (a.start ?? 0) - (b.start ?? 0)),
    [moments]
  );

  // The active section is the last moment whose start is at/before the playhead.
  const activeId = React.useMemo(() => {
    let id: string | null = null;
    for (const m of timed) {
      if ((m.start ?? 0) <= currentTime) {
        id = m.id;
      }
    }
    return id;
  }, [timed, currentTime]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Call outline</p>
      {timed.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Analyze this call to generate moments.</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {timed.map((m) => {
            const isActive = m.id === activeId;
            const label = (m.reason || m.text).trim() || "Moment";
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onJumpToMoment(m)}
                  className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    isActive ? "bg-violet-500/10" : "hover:bg-slate-800/50"
                  }`}
                >
                  <span
                    className={`shrink-0 font-mono text-[11px] tabular-nums ${
                      isActive ? "text-violet-300" : "text-slate-500"
                    }`}
                  >
                    {formatTimestamp(m.start ?? 0)}
                  </span>
                  <span className={`line-clamp-2 text-xs ${isActive ? "text-violet-100" : "text-slate-300"}`}>
                    {label.length > 80 ? `${label.slice(0, 80)}…` : label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
