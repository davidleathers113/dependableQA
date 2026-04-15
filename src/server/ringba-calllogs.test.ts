import { describe, expect, it } from "vitest";
import {
  buildRingbaCallLogsReportRange,
  filterRecordingRows,
  mapRingbaCallLogRowToNormalizedCall,
  parseRingbaCallDtToIso,
} from "./ringba-calllogs";

describe("ringba-calllogs", () => {
  it("builds an inclusive YYYY-MM-DD report window from lookback hours", () => {
    const range = buildRingbaCallLogsReportRange(48);
    expect(range.reportStart.length).toBe(10);
    expect(range.reportEnd.length).toBe(10);
    expect(range.reportStart <= range.reportEnd).toBe(true);
  });

  it("parses Ringba formatted callDt strings using the configured IANA zone", () => {
    const iso = parseRingbaCallDtToIso("04/13/2026 11:08:40 AM", "America/Chicago");
    expect(iso).toMatch(/^2026-04-13T/);
  });

  it("filters out rows without recordings", () => {
    const rows = [
      { hasRecording: true, recordingUrl: "https://example.com/a.mp3" },
      { hasRecording: false, recordingUrl: "https://example.com/b.mp3" },
      { hasRecording: true, recordingUrl: "" },
    ];
    expect(filterRecordingRows(rows as never)).toHaveLength(1);
  });

  it("maps a recording row into the shared ingest call shape", () => {
    const mapped = mapRingbaCallLogRowToNormalizedCall(
      {
        inboundCallId: "RGB123",
        number: "+15551234567",
        callLengthInSeconds: 90,
        hasRecording: true,
        recordingUrl: "https://example.com/r.mp3",
        campaignName: "Camp",
        publisherName: "Pub",
        callDt: "04/13/2026 11:08:40 AM",
      },
      { timeZone: "America/Chicago", minimumDurationSeconds: 30 }
    );
    expect(mapped).not.toBeNull();
    expect(mapped?.externalCallId).toBe("RGB123");
    expect(mapped?.callerNumber).toBe("+15551234567");
    expect(mapped?.durationSeconds).toBe(90);
    expect(mapped?.recordingUrl).toBe("https://example.com/r.mp3");
  });

  it("drops rows below minimum duration", () => {
    const mapped = mapRingbaCallLogRowToNormalizedCall(
      {
        inboundCallId: "RGB123",
        number: "+15551234567",
        callLengthInSeconds: 10,
        hasRecording: true,
        recordingUrl: "https://example.com/r.mp3",
        campaignName: "Camp",
        callDt: "04/13/2026 11:08:40 AM",
      },
      { timeZone: "America/Chicago", minimumDurationSeconds: 30 }
    );
    expect(mapped).toBeNull();
  });
});
