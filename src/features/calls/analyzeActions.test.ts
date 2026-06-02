import { describe, expect, it } from "vitest";
import { summarizeAnalyzeResult } from "./analyzeActions";

describe("summarizeAnalyzeResult", () => {
  it("reports queued transcription and analysis counts", () => {
    const message = summarizeAnalyzeResult({
      requested: 3,
      transcriptionQueued: 2,
      analysisQueued: 1,
      skipped: [],
    });
    expect(message).toBe("Queued 2 transcription and 1 analysis job(s).");
  });

  it("groups and labels skip reasons", () => {
    const message = summarizeAnalyzeResult({
      requested: 4,
      transcriptionQueued: 1,
      analysisQueued: 0,
      skipped: [
        { callId: "a", reason: "no_media" },
        { callId: "b", reason: "no_media" },
        { callId: "c", reason: "not_in_org" },
      ],
    });
    expect(message).toContain("Queued 1 transcription and 0 analysis job(s).");
    expect(message).toContain("Skipped 3 (2 no recording, 1 not in this organization).");
  });

  it("falls back to a humanized label for unknown skip reasons", () => {
    const message = summarizeAnalyzeResult({
      requested: 1,
      transcriptionQueued: 0,
      analysisQueued: 0,
      skipped: [{ callId: "a", reason: "some_new_reason" }],
    });
    expect(message).toContain("1 some new reason");
  });
});
