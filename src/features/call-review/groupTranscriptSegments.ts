import type { TranscriptSegment } from "../../lib/app-data";

/**
 * The minimal shape the transcript view renders and the workspace operates on
 * (seek / active-highlight / search). Both raw `TranscriptSegment`s and grouped
 * `TranscriptTurn`s satisfy it, so a single rendering/active/search path works
 * across all view modes.
 */
export interface TranscriptRow {
  id: string;
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

/**
 * A speaker turn: one or more adjacent ASR segments from the same speaker,
 * merged into a single readable block. Keeps the source `segments` around so
 * the Raw view and per-segment timing stay available.
 */
export interface TranscriptTurn extends TranscriptRow {
  segments: TranscriptSegment[];
}

export interface GroupTranscriptOptions {
  /** Start a new turn when the silence before a segment exceeds this (seconds). */
  maxGapSeconds?: number;
  /** Split a turn once its merged text would exceed this many characters. */
  maxCharacters?: number;
  /** Label used when a segment has no usable speaker. */
  fallbackSpeaker?: string;
}

const DEFAULT_MAX_GAP_SECONDS = 2.5;
const DEFAULT_MAX_CHARACTERS = 650;
const DEFAULT_FALLBACK_SPEAKER = "Unknown";

function resolveSpeaker(segment: TranscriptSegment, fallback: string): string {
  const name = (segment.speaker ?? "").trim();
  return name.length > 0 ? name : fallback;
}

/**
 * Group adjacent ASR segments into speaker turns for a compact, scannable
 * transcript. A new turn starts when the speaker changes, the gap since the
 * previous segment exceeds `maxGapSeconds`, or the merged text would exceed
 * `maxCharacters`. Empty-text segments are dropped. Missing timestamps never
 * crash and never force a split on their own — grouping falls back to speaker
 * identity so transcripts without timing still read as turns.
 */
export function groupTranscriptSegments(
  segments: readonly TranscriptSegment[],
  options: GroupTranscriptOptions = {}
): TranscriptTurn[] {
  const maxGapSeconds = options.maxGapSeconds ?? DEFAULT_MAX_GAP_SECONDS;
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const fallbackSpeaker = options.fallbackSpeaker ?? DEFAULT_FALLBACK_SPEAKER;

  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;
  let turnIndex = 0;

  for (const segment of segments) {
    const text = (segment.text ?? "").trim();
    if (text.length === 0) {
      continue;
    }

    const speaker = resolveSpeaker(segment, fallbackSpeaker);

    // Gap is only meaningful when both the previous turn's last-known time and
    // this segment's start exist; otherwise we never split on timing.
    const prevTime = current ? (current.end ?? current.start) : null;
    const gap =
      current && segment.start != null && prevTime != null ? segment.start - prevTime : null;

    const startNewTurn =
      current === null ||
      speaker !== current.speaker ||
      (gap != null && gap > maxGapSeconds) ||
      current.text.length + 1 + text.length > maxCharacters;

    if (startNewTurn) {
      current = {
        id: `turn-${String(turnIndex)}`,
        speaker,
        text,
        start: segment.start,
        end: segment.end,
        segments: [segment],
      };
      turnIndex += 1;
      turns.push(current);
      continue;
    }

    // Unreachable when `startNewTurn` is false (it is true whenever current is
    // null), but narrows the type for the merge below.
    if (current === null) {
      continue;
    }

    current.segments.push(segment);
    current.text = `${current.text} ${text}`;
    if (current.start == null && segment.start != null) {
      current.start = segment.start;
    }
    if (segment.end != null) {
      current.end = current.end != null ? Math.max(current.end, segment.end) : segment.end;
    }
  }

  return turns;
}
