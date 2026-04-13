import * as React from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import type { CallFlagItem } from "../../lib/app-data";

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  signedUrl: string | null;
  durationSeconds: number;
  flags: CallFlagItem[];
  onFlagRegionClick?: (flagId: string) => void;
}

export function WaveformPanel({ audioRef, signedUrl, durationSeconds, flags, onFlagRegionClick }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wsRef = React.useRef<WaveSurfer | null>(null);
  const regionsRef = React.useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const flagClickRef = React.useRef(onFlagRegionClick);
  flagClickRef.current = onFlagRegionClick;

  React.useEffect(() => {
    const container = containerRef.current;
    const audio = audioRef.current;
    if (!container || !audio || !signedUrl) {
      return;
    }

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container,
      height: 72,
      waveColor: "rgba(148, 163, 184, 0.45)",
      progressColor: "rgba(139, 92, 246, 0.85)",
      cursorColor: "rgba(196, 181, 253, 0.95)",
      cursorWidth: 2,
      minPxPerSec: Math.min(80, Math.max(40, container.clientWidth / Math.max(durationSeconds, 1))),
      fillParent: true,
      interact: true,
      dragToSeek: true,
      autoScroll: true,
      autoCenter: true,
      media: audio,
      url: signedUrl,
      plugins: [regions],
    });

    wsRef.current = ws;

    const onRegionClick = (region: { id: string }) => {
      flagClickRef.current?.(region.id);
    };

    regions.on("region-clicked", onRegionClick);

    return () => {
      regions.un("region-clicked", onRegionClick);
      regions.clearRegions();
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [audioRef, signedUrl, durationSeconds]);

  React.useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) {
      return;
    }

    regions.clearRegions();
    const total = durationSeconds > 0 ? durationSeconds : 1;

    for (const flag of flags) {
      const start = flag.startSeconds;
      if (start == null) {
        continue;
      }
      const end = flag.endSeconds != null ? flag.endSeconds : Math.min(start + 2, total);
      const color =
        flag.severity === "critical"
          ? "rgba(248, 113, 113, 0.38)"
          : flag.severity === "high"
            ? "rgba(251, 146, 60, 0.35)"
            : "rgba(139, 92, 246, 0.32)";

      regions.addRegion({
        id: flag.id,
        start,
        end: Math.max(end, start + 0.05),
        color,
        drag: false,
        resize: false,
      });
    }
  }, [flags, durationSeconds]);

  if (!signedUrl) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-center text-sm text-slate-500">
        No recording loaded. Waveform appears when a recording is available.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full min-h-[88px] rounded-xl border border-slate-800 bg-slate-950/40" />;
}
