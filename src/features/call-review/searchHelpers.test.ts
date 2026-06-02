import { describe, expect, it } from "vitest";
import { findAllMatchPositions, splitTextByRanges } from "./searchHelpers";

describe("findAllMatchPositions", () => {
  it("finds a case-insensitive substring match (the transcript-search path)", () => {
    const text = "I want pricing details for the enterprise plan.";
    const ranges = findAllMatchPositions(text, "PRICING");
    expect(ranges).toEqual([{ start: 7, end: 14 }]);
    expect(text.slice(7, 14)).toBe("pricing");
  });

  it("finds every occurrence, not just the first", () => {
    expect(findAllMatchPositions("pricing and more pricing", "pricing")).toEqual([
      { start: 0, end: 7 },
      { start: 17, end: 24 },
    ]);
  });

  it("returns no ranges for a missing term or an empty needle", () => {
    expect(findAllMatchPositions("no match here", "pricing")).toEqual([]);
    expect(findAllMatchPositions("anything", "")).toEqual([]);
  });

  it("does not loop infinitely on overlapping-capable input", () => {
    // Advancing by max(1, needle.length) keeps progress on degenerate needles.
    expect(findAllMatchPositions("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });
});

describe("splitTextByRanges", () => {
  it("splits text into plain + hit parts for highlighting", () => {
    const text = "I want pricing details";
    const parts = splitTextByRanges(text, findAllMatchPositions(text, "pricing"));
    expect(parts).toEqual([
      { type: "plain", text: "I want " },
      { type: "hit", text: "pricing" },
      { type: "plain", text: " details" },
    ]);
  });

  it("returns the whole text as a single plain part when there are no matches", () => {
    expect(splitTextByRanges("nothing to highlight", [])).toEqual([
      { type: "plain", text: "nothing to highlight" },
    ]);
  });

  it("merges overlapping/adjacent ranges so a hit is not double-wrapped", () => {
    const parts = splitTextByRanges("aaaa", [
      { start: 0, end: 2 },
      { start: 1, end: 3 },
    ]);
    expect(parts).toEqual([
      { type: "hit", text: "aaa" },
      { type: "plain", text: "a" },
    ]);
  });
});
