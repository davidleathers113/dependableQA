import { describe, expect, it } from "vitest";
import { normalizeRetreaverWebhookCall } from "./retreaver-webhook";

describe("normalizeRetreaverWebhookCall", () => {
  it("normalizes a plain-object payload using canonical keys", () => {
    const result = normalizeRetreaverWebhookCall({
      call_uuid: "rt-uuid-1",
      caller_id: "+15555551234",
      number_called: "+18005550000",
      created_at: "2026-06-01T12:00:00.000Z",
      duration: 137,
      recording_url: "https://recordings.retreaver.com/rt-uuid-1.mp3",
      publisher: "Affiliate A",
      buyer: "Buyer X",
      disposition: "converted",
    });

    expect(result).toEqual({
      externalCallId: "rt-uuid-1",
      callerNumber: "+15555551234",
      destinationNumber: "+18005550000",
      durationSeconds: 137,
      startedAt: "2026-06-01T12:00:00.000Z",
      publisherName: "Affiliate A",
      buyerName: "Buyer X",
      currentDisposition: "converted",
      recordingUrl: "https://recordings.retreaver.com/rt-uuid-1.mp3",
    });
  });

  it("reads a URLSearchParams payload (the common webhook delivery form)", () => {
    const params = new URLSearchParams();
    params.set("call_id", "rt-2");
    params.set("caller_number", "+15555550002");
    params.set("start_time", "2026-06-02T08:30:00Z");
    params.set("call_duration", "60");

    const result = normalizeRetreaverWebhookCall(params);
    expect(result).toMatchObject({
      externalCallId: "rt-2",
      callerNumber: "+15555550002",
      durationSeconds: 60,
      startedAt: "2026-06-02T08:30:00.000Z",
    });
    // No recording provided → omitted (stays metadata-only downstream).
    expect(result).not.toHaveProperty("recordingUrl");
  });

  it("honors documented aliases in preference order", () => {
    const result = normalizeRetreaverWebhookCall({
      uuid: "rt-3",
      phone_number: "+15555550003",
      timestamp: "2026-06-03T00:00:00Z",
      total_duration: "45",
      affiliate: "Aff B",
      handler_id: "handler-9",
      audio_url: "https://r.example/3.mp3",
      conversion_status: "non_conversion",
    });
    expect(result).toMatchObject({
      externalCallId: "rt-3",
      callerNumber: "+15555550003",
      durationSeconds: 45,
      publisherName: "Aff B",
      buyerName: "handler-9",
      currentDisposition: "non_conversion",
      recordingUrl: "https://r.example/3.mp3",
    });
  });

  it("parses a numeric epoch timestamp (seconds and milliseconds)", () => {
    const seconds = normalizeRetreaverWebhookCall({ caller_id: "+1", timestamp: "1764590400" });
    expect(seconds?.startedAt).toBe(new Date(1764590400 * 1000).toISOString());

    const millis = normalizeRetreaverWebhookCall({ caller_id: "+1", timestamp: "1764590400000" });
    expect(millis?.startedAt).toBe(new Date(1764590400000).toISOString());
  });

  it("coerces a missing or non-numeric duration to 0", () => {
    expect(
      normalizeRetreaverWebhookCall({ caller_id: "+1", created_at: "2026-06-01T00:00:00Z" })?.durationSeconds
    ).toBe(0);
    expect(
      normalizeRetreaverWebhookCall({ caller_id: "+1", created_at: "2026-06-01T00:00:00Z", duration: "abc" })
        ?.durationSeconds
    ).toBe(0);
  });

  it("returns null when the caller is missing or the time is missing/unparseable", () => {
    expect(normalizeRetreaverWebhookCall({ created_at: "2026-06-01T00:00:00Z" })).toBeNull();
    expect(normalizeRetreaverWebhookCall({ caller_id: "+1" })).toBeNull();
    expect(normalizeRetreaverWebhookCall({ caller_id: "+1", created_at: "not-a-date" })).toBeNull();
  });
});
