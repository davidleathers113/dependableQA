import { describe, expect, it, vi } from "vitest";
import type { IntegrationContext } from "./integration-ingest";
import {
  TRACKDRIVE_IMPORT_MAX_RECORDS,
  importTrackDriveCallsMetadata,
  testTrackDriveConnection,
} from "./trackdrive-import";
import type { TrackDriveFetch } from "./trackdrive-calls";

const integration: IntegrationContext = {
  id: "integration-1",
  organizationId: "org-1",
  provider: "trackdrive",
  displayName: "TrackDrive",
  config: {},
};

function trackDriveCall(uuid: string, overrides: Record<string, unknown> = {}) {
  return {
    uuid,
    caller_number: "+15555550000",
    number_called: "+18005550100",
    created_at: "2026-06-01T12:00:00.000Z",
    total_duration: 90,
    recording_url: "https://recordings.example.com/call.mp3",
    traffic_source: "Publisher A",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function makeFetch(pages: Record<string, unknown>): TrackDriveFetch {
  return vi.fn(async (url: string) => {
    const cursor = new URL(url).searchParams.get("cursor") ?? "-1";
    return jsonResponse(pages[cursor] ?? { calls: [], metadata: { next_cursor: 0 } });
  });
}

function makeIngest() {
  return vi.fn(async (_client, _integration, _payload, calls: Array<Record<string, unknown>>, _options) => ({
    ingestedCount: calls.length,
    rejectedCount: 0,
    recordingCount: calls.filter((call) => typeof call.recordingUrl === "string").length,
    importedCallIds: calls.map((_, index) => `call-${index + 1}`),
    eventId: "event-1",
    statusCode: 200,
  }));
}

describe("importTrackDriveCallsMetadata", () => {
  const baseOptions = {
    client: {} as never,
    integration,
    subdomain: "acme",
    publicKey: "public-key",
    privateKey: "private-key",
  };

  it("fetches cursor pages, skips invalid calls, and ingests metadata-only", async () => {
    const fetchImpl = makeFetch({
      "-1": {
        calls: [trackDriveCall("td-1"), trackDriveCall("", { uuid: "" })],
        metadata: { next_cursor: 250 },
      },
      "250": {
        calls: [trackDriveCall("td-2", { recording_url: "" })],
        metadata: { next_cursor: 0 },
      },
    });
    const ingestImpl = makeIngest();

    const result = await importTrackDriveCallsMetadata({ ...baseOptions, fetchImpl, ingestImpl });

    expect(result).toEqual({
      fetched: 3,
      accepted: 2,
      skipped: 1,
      pagesFetched: 2,
      stoppedReason: "cursor_exhausted",
      nextCursor: null,
      ingestedCount: 2,
      rejectedCount: 0,
      recordingCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ingestImpl).toHaveBeenCalledTimes(1);
    expect(ingestImpl.mock.calls[0][4]).toEqual({ enqueueAiJobs: false });
    expect(ingestImpl.mock.calls[0][3]).toEqual([
      expect.objectContaining({ externalCallId: "td-1", recordingUrl: "https://recordings.example.com/call.mp3" }),
      expect.objectContaining({ externalCallId: "td-2" }),
    ]);
    expect(ingestImpl.mock.calls[0][3][1]).not.toHaveProperty("recordingUrl");
  });

  it("stops on an empty page without calling ingest", async () => {
    const fetchImpl = makeFetch({ "-1": { calls: [], metadata: { next_cursor: 250 } } });
    const ingestImpl = makeIngest();

    const result = await importTrackDriveCallsMetadata({ ...baseOptions, fetchImpl, ingestImpl });

    expect(result.stoppedReason).toBe("empty_page");
    expect(result.pagesFetched).toBe(1);
    expect(result.fetched).toBe(0);
    expect(result.accepted).toBe(0);
    expect(ingestImpl).not.toHaveBeenCalled();
  });

  it("stops at maxRecords after accepting the capped number of normalized calls", async () => {
    const fetchImpl = makeFetch({
      "-1": {
        calls: [trackDriveCall("td-1"), trackDriveCall("td-2")],
        metadata: { next_cursor: 250 },
      },
    });
    const ingestImpl = makeIngest();

    const result = await importTrackDriveCallsMetadata({
      ...baseOptions,
      fetchImpl,
      ingestImpl,
      maxRecords: 1,
      perPage: 50,
    });

    expect(result.stoppedReason).toBe("max_records");
    expect(result.fetched).toBe(2);
    expect(result.accepted).toBe(1);
    expect(result.pagesFetched).toBe(1);
    expect(ingestImpl.mock.calls[0][3]).toHaveLength(1);
  });

  it("stops at maxPages and returns the next cursor for the next bounded run", async () => {
    const fetchImpl = makeFetch({
      "-1": {
        calls: [trackDriveCall("td-1")],
        metadata: { next_cursor: 250 },
      },
      "250": {
        calls: [trackDriveCall("td-2")],
        metadata: { next_cursor: 0 },
      },
    });

    const result = await importTrackDriveCallsMetadata({
      ...baseOptions,
      fetchImpl,
      ingestImpl: makeIngest(),
      maxPages: 1,
    });

    expect(result.stoppedReason).toBe("max_pages");
    expect(result.pagesFetched).toBe(1);
    expect(result.nextCursor).toBe("250");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("clamps requested maxRecords to the hard cap before fetching", async () => {
    const fetchImpl = makeFetch({
      "-1": {
        calls: [trackDriveCall("td-1")],
        metadata: { next_cursor: 0 },
      },
    });

    await importTrackDriveCallsMetadata({
      ...baseOptions,
      fetchImpl,
      ingestImpl: makeIngest(),
      maxRecords: TRACKDRIVE_IMPORT_MAX_RECORDS + 1000,
      perPage: TRACKDRIVE_IMPORT_MAX_RECORDS + 1000,
    });

    const requestedUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(new URL(requestedUrl).searchParams.get("per_page")).toBe(String(TRACKDRIVE_IMPORT_MAX_RECORDS));
  });
});

describe("testTrackDriveConnection", () => {
  it("fetches a one-call sample without importing anything", async () => {
    const fetchImpl = makeFetch({
      "-1": {
        calls: [trackDriveCall("td-1")],
        metadata: { next_cursor: 0 },
      },
    });

    const result = await testTrackDriveConnection({
      subdomain: "acme",
      publicKey: "pub",
      privateKey: "priv",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, sampleCount: 1 });
    const requestedUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    const url = new URL(requestedUrl);
    expect(url.searchParams.get("per_page")).toBe("1");
    expect(url.searchParams.get("columns")).toBe("uuid,caller_number,created_at,recording_url");
  });

  it("returns a non-secret error when the sample fetch fails", async () => {
    const privateKey = "private-key";
    const fetchImpl: TrackDriveFetch = vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401));

    const result = await testTrackDriveConnection({
      subdomain: "acme",
      publicKey: "pub",
      privateKey,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.sampleCount).toBe(0);
    expect(result.error).toContain("HTTP 401");
    expect(result.error).not.toContain(privateKey);
  });
});
