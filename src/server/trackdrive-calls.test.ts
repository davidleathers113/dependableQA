import { describe, expect, it, vi } from "vitest";
import {
  TRACKDRIVE_CALLS_START_CURSOR,
  buildTrackDriveBasicAuthHeader,
  buildTrackDriveCallsUrl,
  fetchTrackDriveCallsPage,
  mapTrackDriveCallToNormalized,
  nextTrackDriveCursor,
  type TrackDriveFetch,
} from "./trackdrive-calls";

describe("buildTrackDriveCallsUrl", () => {
  it("targets the account subdomain's calls endpoint and defaults the start cursor", () => {
    const url = new URL(buildTrackDriveCallsUrl({ subdomain: "acme" }));
    expect(url.origin).toBe("https://acme.trackdrive.com");
    expect(url.pathname).toBe("/api/v1/calls");
    expect(url.searchParams.get("cursor")).toBe(TRACKDRIVE_CALLS_START_CURSOR);
  });

  it("encodes cursor, per_page, date range, and columns via URL APIs", () => {
    const url = new URL(
      buildTrackDriveCallsUrl({
        subdomain: "Acme", // normalized to lowercase
        cursor: 1200,
        perPage: 50,
        createdAtFromIso: "2026-06-01T00:00:00.000Z",
        createdAtToIso: "2026-06-30T23:59:59.000Z",
        columns: ["uuid", "recording_url", "caller_number"],
      })
    );
    expect(url.host).toBe("acme.trackdrive.com");
    expect(url.searchParams.get("cursor")).toBe("1200");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("created_at_from")).toBe("2026-06-01T00:00:00.000Z");
    expect(url.searchParams.get("created_at_to")).toBe("2026-06-30T23:59:59.000Z");
    expect(url.searchParams.get("columns")).toBe("uuid,recording_url,caller_number");
  });

  it("rejects an empty or unsafe subdomain (no host injection)", () => {
    expect(() => buildTrackDriveCallsUrl({ subdomain: "  " })).toThrow("subdomain is required");
    expect(() => buildTrackDriveCallsUrl({ subdomain: "evil.com/x" })).toThrow("letters, numbers, and hyphens");
  });
});

describe("buildTrackDriveBasicAuthHeader", () => {
  it("produces a deterministic Basic header from public:private", () => {
    // base64("pub:priv") === "cHViOnByaXY="
    expect(buildTrackDriveBasicAuthHeader("pub", "priv")).toBe("Basic cHViOnByaXY=");
  });

  it("trims inputs and requires both keys", () => {
    expect(buildTrackDriveBasicAuthHeader("  pub  ", " priv ")).toBe("Basic cHViOnByaXY=");
    expect(() => buildTrackDriveBasicAuthHeader("", "priv")).toThrow("public and private keys are required");
    expect(() => buildTrackDriveBasicAuthHeader("pub", "  ")).toThrow("public and private keys are required");
  });
});

describe("mapTrackDriveCallToNormalized", () => {
  const fullCall = {
    uuid: "td-uuid-1",
    caller_number: "+15555551234",
    number_called: "+18005550000",
    created_at: "2026-06-01T12:00:00.000Z",
    recording_url: "https://recordings.trackdrive.com/td-uuid-1.mp3",
    total_duration: 125,
    answered_duration: 110,
    traffic_source: "Publisher A",
    buyer: "Buyer X",
    status: "completed",
  };

  it("maps documented fields into the normalized import shape", () => {
    expect(mapTrackDriveCallToNormalized(fullCall)).toEqual({
      externalCallId: "td-uuid-1",
      callerNumber: "+15555551234",
      durationSeconds: 125,
      startedAt: "2026-06-01T12:00:00.000Z",
      destinationNumber: "+18005550000",
      publisherName: "Publisher A",
      recordingUrl: "https://recordings.trackdrive.com/td-uuid-1.mp3",
    });
  });

  it("stays metadata-only (omits recordingUrl) when no recording is present", () => {
    const normalized = mapTrackDriveCallToNormalized({ ...fullCall, recording_url: "" });
    expect(normalized).not.toBeNull();
    expect(normalized).not.toHaveProperty("recordingUrl");
  });

  it("filters out calls without a recording when requireRecording is set", () => {
    expect(
      mapTrackDriveCallToNormalized({ ...fullCall, recording_url: "" }, { requireRecording: true })
    ).toBeNull();
  });

  it("drops calls shorter than the minimum duration", () => {
    expect(mapTrackDriveCallToNormalized({ ...fullCall, total_duration: 20 }, { minimumDurationSeconds: 30 })).toBeNull();
    expect(mapTrackDriveCallToNormalized({ ...fullCall, total_duration: 40 }, { minimumDurationSeconds: 30 })).not.toBeNull();
  });

  it("returns null when a required field is missing or unparseable", () => {
    expect(mapTrackDriveCallToNormalized({ ...fullCall, uuid: "" })).toBeNull();
    expect(mapTrackDriveCallToNormalized({ ...fullCall, caller_number: "" })).toBeNull();
    expect(mapTrackDriveCallToNormalized({ ...fullCall, created_at: "not-a-date" })).toBeNull();
  });

  it("coerces a string total_duration and a missing duration to a safe number", () => {
    expect(mapTrackDriveCallToNormalized({ ...fullCall, total_duration: "90" })?.durationSeconds).toBe(90);
    expect(mapTrackDriveCallToNormalized({ ...fullCall, total_duration: undefined })?.durationSeconds).toBe(0);
  });
});

describe("fetchTrackDriveCallsPage", () => {
  const PRIVATE_KEY = "super-secret-private-key";

  function mockJsonFetch(body: string, init: { ok?: boolean; status?: number } = {}): TrackDriveFetch {
    return vi.fn(async () => ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: async () => body,
    }));
  }

  const baseOptions = {
    subdomain: "acme",
    publicKey: "pub",
    privateKey: PRIVATE_KEY,
  };

  it("requests the built URL with a Basic auth header and returns calls + nextCursor", async () => {
    const fetchImpl = mockJsonFetch(
      JSON.stringify({ calls: [{ uuid: "td-1", caller_number: "+15555550001" }], metadata: { next_cursor: 1200 } })
    );

    const result = await fetchTrackDriveCallsPage({ ...baseOptions, cursor: -1, perPage: 50, fetchImpl });

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].uuid).toBe("td-1");
    expect(result.nextCursor).toBe("1200");

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("https://acme.trackdrive.com/api/v1/calls");
    expect(url).toContain("cursor=-1");
    expect(url).toContain("per_page=50");
    expect(init.headers.Authorization).toBe(buildTrackDriveBasicAuthHeader("pub", PRIVATE_KEY));
    expect(init.headers.Accept).toBe("application/json");
    // The raw secret is never sent in cleartext (only inside the base64 token).
    expect(init.headers.Authorization).not.toContain(PRIVATE_KEY);
  });

  it("stops pagination when next_cursor is 0", async () => {
    const fetchImpl = mockJsonFetch(JSON.stringify({ calls: [{ uuid: "td-1", caller_number: "+1" }], metadata: { next_cursor: 0 } }));
    const result = await fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl });
    expect(result.nextCursor).toBeNull();
  });

  it("accepts a bare array response (root=false) with no cursor", async () => {
    const fetchImpl = mockJsonFetch(JSON.stringify([{ uuid: "td-1", caller_number: "+1" }, null, "junk"]));
    const result = await fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl });
    // Non-object entries are filtered out conservatively.
    expect(result.calls).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("throws with HTTP status (no credentials) on a non-ok response", async () => {
    const fetchImpl = mockJsonFetch(JSON.stringify({ error: "unauthorized" }), { ok: false, status: 401 });
    await expect(fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl })).rejects.toThrow("HTTP 401");
    await expect(fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl })).rejects.not.toThrow(PRIVATE_KEY);
  });

  it("throws on malformed JSON and on an unexpected shape", async () => {
    await expect(
      fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl: mockJsonFetch("not json") })
    ).rejects.toThrow("was not JSON");
    await expect(
      fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl: mockJsonFetch(JSON.stringify({ metadata: {} })) })
    ).rejects.toThrow("unexpected shape");
  });

  it("wraps a transport failure without leaking credentials", async () => {
    const fetchImpl: TrackDriveFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl })).rejects.toThrow("TrackDrive calls request failed");
    await expect(fetchTrackDriveCallsPage({ ...baseOptions, fetchImpl })).rejects.not.toThrow(PRIVATE_KEY);
  });
});

describe("nextTrackDriveCursor", () => {
  it("returns the next cursor while more pages remain", () => {
    expect(nextTrackDriveCursor({ next_cursor: 1200 })).toBe("1200");
    expect(nextTrackDriveCursor({ next_cursor: "1200" })).toBe("1200");
  });

  it("stops at 0, null, undefined, empty, or missing metadata", () => {
    expect(nextTrackDriveCursor({ next_cursor: 0 })).toBeNull();
    expect(nextTrackDriveCursor({ next_cursor: "0" })).toBeNull();
    expect(nextTrackDriveCursor({ next_cursor: null })).toBeNull();
    expect(nextTrackDriveCursor({ next_cursor: undefined })).toBeNull();
    expect(nextTrackDriveCursor({})).toBeNull();
    expect(nextTrackDriveCursor(null)).toBeNull();
  });
});
