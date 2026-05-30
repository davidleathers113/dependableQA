import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { probeRecordingReadiness, verifyRecordings } from "./recording-preflight";

// The SSRF guard resolves hosts; mock DNS so the probe never hits the network.
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

const MB = 1024 * 1024;

function fakeResponse(opts: { status?: number; headers?: Record<string, string>; body?: Uint8Array | null }) {
  const status = opts.status ?? 200;
  const body =
    opts.body == null
      ? null
      : new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(opts.body as Uint8Array);
            controller.close();
          },
        });
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(opts.headers ?? {}),
    body,
  } as unknown as Response;
}

/** Stub fetch with a handler that sees the HTTP method (HEAD vs GET). */
function stubFetchByMethod(handler: (method: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => handler(String(init.method)))
  );
}

/** Stub fetch with a handler that sees both the URL and the HTTP method. */
function stubFetchByUrl(handler: (url: string, method: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => handler(String(url), String(init.method)))
  );
}

beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("probeRecordingReadiness", () => {
  it("returns ready via the HEAD fast-path when content-type is audio", async () => {
    stubFetchByMethod((method) => {
      if (method === "HEAD") return fakeResponse({ status: 200, headers: { "content-type": "audio/mpeg" } });
      throw new Error("GET should not be needed");
    });
    expect(await probeRecordingReadiness("https://media.ringba.com/r", { maxBytes: 25 * MB })).toBe("ready");
  });

  it("falls back to a ranged GET (HEAD 403 on S3 presigned URLs) and sniffs magic bytes", async () => {
    stubFetchByMethod((method) => {
      if (method === "HEAD") return fakeResponse({ status: 403 });
      return fakeResponse({
        status: 206,
        headers: { "content-type": "application/octet-stream", "content-range": "bytes 0-8/9" },
        body: Buffer.from("ID3 audio"),
      });
    });
    expect(await probeRecordingReadiness("https://media.ringba.com/r", { maxBytes: 25 * MB })).toBe("ready");
  });

  it("returns too_large from the Content-Range total", async () => {
    stubFetchByMethod((method) => {
      if (method === "HEAD") return fakeResponse({ status: 403 });
      return fakeResponse({
        status: 206,
        headers: { "content-type": "audio/mpeg", "content-range": "bytes 0-65535/99999999" },
        body: Buffer.from("ID3"),
      });
    });
    expect(await probeRecordingReadiness("https://media.ringba.com/r", { maxBytes: 25 * MB })).toBe("too_large");
  });

  it("returns not_audio for a non-audio body", async () => {
    stubFetchByMethod((method) => {
      if (method === "HEAD") return fakeResponse({ status: 403 });
      return fakeResponse({
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.from("<html>not audio</html>"),
      });
    });
    expect(await probeRecordingReadiness("https://media.ringba.com/r", { maxBytes: 25 * MB })).toBe("not_audio");
  });

  it("returns expired_or_forbidden when the ranged GET is forbidden/gone", async () => {
    stubFetchByMethod((method) => {
      if (method === "HEAD") return fakeResponse({ status: 403 });
      return fakeResponse({ status: 410 });
    });
    expect(await probeRecordingReadiness("https://media.ringba.com/r", { maxBytes: 25 * MB })).toBe(
      "expired_or_forbidden"
    );
  });

  it("uses the final redirected URL path for the extension fallback", async () => {
    // Original URL has no audio hint in its path; it 302-redirects to an S3
    // key ending in `.mp3`. The body is unrecognizable and the content-type is
    // ambiguous, so ONLY the final URL's path can classify this as audio.
    const original = "https://media.ringba.com/recording-public?id=abc";
    const s3 = "https://s3.amazonaws.com/bucket/key.mp3";
    stubFetchByUrl((url, method) => {
      if (url.startsWith("https://media.ringba.com/")) {
        return fakeResponse({ status: 302, headers: { location: s3 } });
      }
      if (method === "HEAD") return fakeResponse({ status: 403 });
      return fakeResponse({
        status: 206,
        headers: { "content-type": "application/octet-stream", "content-range": "bytes 0-9/10" },
        body: Buffer.from("xxxxxxxxxx"),
      });
    });
    // The original path "/recording-public" would classify as not_audio.
    expect(await probeRecordingReadiness(original, { maxBytes: 25 * MB })).toBe("ready");
  });

  it("returns unreachable on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      })
    );
    expect(await probeRecordingReadiness("https://media.ringba.com/r", { maxBytes: 25 * MB })).toBe("unreachable");
  });
});

function fakeClient(rows: Array<{ id: string; recording_storage_path?: string; recording_url?: string }>) {
  return {
    from(table: string) {
      if (table !== "calls") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: rows.filter((r) => ids.includes(r.id)),
              error: null,
            }),
          }),
        }),
      };
    },
  };
}

describe("verifyRecordings", () => {
  it("classifies each call by storage / media / probe result, preserving order", async () => {
    const client = fakeClient([
      { id: "stored", recording_storage_path: "org/stored.mp3" },
      { id: "no_media", recording_url: "" },
      { id: "has_url", recording_url: "https://media.ringba.com/r" },
    ]);

    const probe = vi.fn(async () => "ready" as const);
    const results = await verifyRecordings(client as never, {
      organizationId: "org_1",
      callIds: ["stored", "no_media", "has_url", "missing"],
      probe,
    });

    expect(results).toEqual([
      { callId: "stored", status: "already_materialized" },
      { callId: "no_media", status: "no_media" },
      { callId: "has_url", status: "ready" },
      { callId: "missing", status: "not_found" },
    ]);
    // Only the URL-bearing, unmaterialized call hits the network probe.
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith("https://media.ringba.com/r", expect.objectContaining({ maxBytes: expect.any(Number) }));
  });

  it("returns an empty array when no call ids are supplied", async () => {
    const client = fakeClient([]);
    expect(await verifyRecordings(client as never, { organizationId: "org_1", callIds: [] })).toEqual([]);
  });
});
