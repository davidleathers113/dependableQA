import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "../../lib/app-data";
import { groupTranscriptSegments } from "./groupTranscriptSegments";

function seg(partial: Partial<TranscriptSegment> & { id: string; text: string }): TranscriptSegment {
  return {
    speaker: "Agent",
    ...partial,
  };
}

describe("groupTranscriptSegments", () => {
  it("merges consecutive same-speaker segments into one turn", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", start: 11, end: 12, text: "Hello," }),
      seg({ id: "b", speaker: "Agent", start: 12, end: 13, text: "my name is Mike Mayo," }),
      seg({ id: "c", speaker: "Agent", start: 13, end: 15, text: "a licensed agent." }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.speaker).toBe("Agent");
    expect(turns[0]?.text).toBe("Hello, my name is Mike Mayo, a licensed agent.");
    expect(turns[0]?.start).toBe(11);
    expect(turns[0]?.end).toBe(15);
    // original segments remain available for raw view / debugging
    expect(turns[0]?.segments.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("starts a new turn when the speaker changes", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", start: 0, end: 2, text: "How can I help?" }),
      seg({ id: "b", speaker: "Customer", start: 2, end: 4, text: "I have a question." }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]?.speaker).toBe("Agent");
    expect(turns[1]?.speaker).toBe("Customer");
  });

  it("never merges different speakers even across a tiny gap", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", start: 0, end: 1, text: "Right." }),
      seg({ id: "b", speaker: "Customer", start: 1, end: 2, text: "Okay." }),
      seg({ id: "c", speaker: "Agent", start: 2, end: 3, text: "Good." }),
    ]);

    expect(turns.map((t) => t.speaker)).toEqual(["Agent", "Customer", "Agent"]);
  });

  it("splits a same-speaker turn on a long pause", () => {
    const turns = groupTranscriptSegments(
      [
        seg({ id: "a", speaker: "Agent", start: 0, end: 2, text: "One moment." }),
        seg({ id: "b", speaker: "Agent", start: 10, end: 12, text: "Thanks for waiting." }),
      ],
      { maxGapSeconds: 2.5 }
    );

    expect(turns).toHaveLength(2);
    expect(turns[0]?.text).toBe("One moment.");
    expect(turns[1]?.text).toBe("Thanks for waiting.");
  });

  it("keeps a same-speaker turn together across a short pause", () => {
    const turns = groupTranscriptSegments(
      [
        seg({ id: "a", speaker: "Agent", start: 0, end: 2, text: "One moment." }),
        seg({ id: "b", speaker: "Agent", start: 4, end: 6, text: "Thanks for waiting." }),
      ],
      { maxGapSeconds: 2.5 }
    );

    expect(turns).toHaveLength(1);
  });

  it("splits a long monologue into readable chunks", () => {
    const turns = groupTranscriptSegments(
      [
        seg({ id: "a", speaker: "Agent", start: 0, end: 1, text: "aaaaa" }),
        seg({ id: "b", speaker: "Agent", start: 1, end: 2, text: "bbbbb" }),
        seg({ id: "c", speaker: "Agent", start: 2, end: 3, text: "ccccc" }),
      ],
      // "aaaaa bbbbb" = 11 chars fits; adding " ccccc" -> 17 exceeds 12
      { maxCharacters: 12 }
    );

    expect(turns).toHaveLength(2);
    expect(turns[0]?.text).toBe("aaaaa bbbbb");
    expect(turns[1]?.text).toBe("ccccc");
  });

  it("uses the fallback speaker when speaker is missing or blank", () => {
    const turns = groupTranscriptSegments(
      [
        seg({ id: "a", speaker: "", start: 0, end: 1, text: "Hi." }),
        seg({ id: "b", speaker: "   ", start: 1, end: 2, text: "There." }),
      ],
      { fallbackSpeaker: "Unknown" }
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]?.speaker).toBe("Unknown");
    expect(turns[0]?.text).toBe("Hi. There.");
  });

  it("groups by speaker without crashing when timestamps are missing", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", text: "No timing here." }),
      seg({ id: "b", speaker: "Agent", text: "Still the agent." }),
      seg({ id: "c", speaker: "Customer", text: "Now the customer." }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]?.text).toBe("No timing here. Still the agent.");
    expect(turns[0]?.start).toBeUndefined();
    expect(turns[0]?.end).toBeUndefined();
    expect(turns[1]?.speaker).toBe("Customer");
  });

  it("backfills turn start/end from later segments when the first lacks timing", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", text: "Missing start." }),
      seg({ id: "b", speaker: "Agent", start: 5, end: 7, text: "Has timing." }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.start).toBe(5);
    expect(turns[0]?.end).toBe(7);
  });

  it("ignores empty / whitespace-only text segments", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", start: 0, end: 1, text: "Real." }),
      seg({ id: "b", speaker: "Agent", start: 1, end: 2, text: "   " }),
      seg({ id: "c", speaker: "Agent", start: 2, end: 3, text: "" }),
      seg({ id: "d", speaker: "Agent", start: 3, end: 4, text: "Words." }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.text).toBe("Real. Words.");
    expect(turns[0]?.segments.map((s) => s.id)).toEqual(["a", "d"]);
  });

  it("merges overlapping timestamps and tracks the max end", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", start: 11, end: 14, text: "Overlapping" }),
      seg({ id: "b", speaker: "Agent", start: 12, end: 15, text: "segments." }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.start).toBe(11);
    expect(turns[0]?.end).toBe(15);
  });

  it("returns an empty array for empty input", () => {
    expect(groupTranscriptSegments([])).toEqual([]);
  });

  it("assigns stable, unique turn ids", () => {
    const turns = groupTranscriptSegments([
      seg({ id: "a", speaker: "Agent", start: 0, end: 1, text: "One." }),
      seg({ id: "b", speaker: "Customer", start: 1, end: 2, text: "Two." }),
      seg({ id: "c", speaker: "Agent", start: 2, end: 3, text: "Three." }),
    ]);

    expect(turns.map((t) => t.id)).toEqual(["turn-0", "turn-1", "turn-2"]);
  });
});
