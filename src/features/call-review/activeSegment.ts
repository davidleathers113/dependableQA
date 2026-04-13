import type { TranscriptSegment } from "../../lib/app-data";

export function getActiveSegmentId(segments: TranscriptSegment[], currentTimeSeconds: number): string | null {
  if (segments.length === 0) {
    return null;
  }

  for (const segment of segments) {
    const start = segment.start;
    const end = segment.end;
    if (start != null && end != null && currentTimeSeconds >= start && currentTimeSeconds < end) {
      return segment.id;
    }
  }

  let best: TranscriptSegment | null = null;
  let bestStart = -Infinity;
  for (const segment of segments) {
    const start = segment.start;
    if (start != null && start <= currentTimeSeconds && start >= bestStart) {
      best = segment;
      bestStart = start;
    }
  }

  return best?.id ?? null;
}
