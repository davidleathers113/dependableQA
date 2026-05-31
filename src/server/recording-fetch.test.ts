import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import {
  assertSafeRecordingUrl,
  fetchRecordingWithGuards,
  resolveAudioExtension,
} from "./recording-fetch";

// DNS is mocked so the SSRF resolve-and-validate guard never hits the network.
// Default: every host resolves to a public address (set per-test in beforeEach);
// individual tests override with a private address to exercise the guard.
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const PUBLIC_ADDR = [{ address: "93.184.216.34", family: 4 }];

const MB = 1024 * 1024;

// Minimal Response-shaped object: the fetcher only touches status/ok/headers/body.
// Building it by hand (instead of `new Response`) keeps full control over
// content-length, which undici otherwise derives from the body.
function fakeResponse(opts: {
  status?: number;
  headers?: Record<string, string>;
  body?: Uint8Array | null;
}) {
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

function stubFetchSequence(responses: Array<() => Response>) {
  const fn = vi.fn();
  for (const make of responses) {
    fn.mockImplementationOnce(async () => make());
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

function wavBytes() {
  return Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE and pcm data")]);
}

beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue(PUBLIC_ADDR as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("assertSafeRecordingUrl", () => {
  it("accepts a public https host", () => {
    expect(assertSafeRecordingUrl("https://media.ringba.com/recording-public?k=x").hostname).toBe(
      "media.ringba.com"
    );
  });

  it("rejects localhost", () => {
    expect(() => assertSafeRecordingUrl("http://localhost/r.mp3")).toThrow("hostname is not allowed");
  });

  it("rejects link-local / metadata IPs", () => {
    expect(() => assertSafeRecordingUrl("http://169.254.169.254/latest")).toThrow(
      "private or loopback"
    );
  });

  it("rejects non-http protocols", () => {
    expect(() => assertSafeRecordingUrl("ftp://example.com/r")).toThrow("http or https");
  });
});

describe("assertSafeRecordingUrl host allowlist (RECORDING_HOST_ALLOWLIST)", () => {
  afterEach(() => {
    delete process.env.RECORDING_HOST_ALLOWLIST;
  });

  it("allows a host under an allowlisted domain suffix", () => {
    process.env.RECORDING_HOST_ALLOWLIST = "ringba.com, amazonaws.com";
    expect(assertSafeRecordingUrl("https://media.ringba.com/r.mp3").hostname).toBe("media.ringba.com");
    expect(assertSafeRecordingUrl("https://recordings.s3.amazonaws.com/r.mp3").hostname).toBe(
      "recordings.s3.amazonaws.com"
    );
  });

  it("allows an exact host match and tolerates leading dots in entries", () => {
    process.env.RECORDING_HOST_ALLOWLIST = ".ringba.com";
    expect(assertSafeRecordingUrl("https://ringba.com/r.mp3").hostname).toBe("ringba.com");
  });

  it("rejects a host outside the allowlist", () => {
    process.env.RECORDING_HOST_ALLOWLIST = "ringba.com";
    expect(() => assertSafeRecordingUrl("https://evil.example.com/r.mp3")).toThrow("not in the allowlist");
  });

  it("does not match a look-alike suffix", () => {
    process.env.RECORDING_HOST_ALLOWLIST = "ringba.com";
    expect(() => assertSafeRecordingUrl("https://evilringba.com/r.mp3")).toThrow("not in the allowlist");
  });

  it("enforces nothing when unset (public host passes)", () => {
    expect(assertSafeRecordingUrl("https://media.ringba.com/r.mp3").hostname).toBe("media.ringba.com");
  });
});

describe("resolveAudioExtension", () => {
  it("detects wav from magic bytes even when content-type lies", () => {
    expect(resolveAudioExtension(wavBytes(), "application/octet-stream", "/recording")).toBe(".wav");
  });

  it("detects mp3 from an ID3 header", () => {
    expect(resolveAudioExtension(Buffer.from("ID3\x04junk"), "application/octet-stream", "/x")).toBe(
      ".mp3"
    );
  });

  it("falls back to content-type when bytes are ambiguous", () => {
    expect(resolveAudioExtension(Buffer.from("\x00\x01\x02\x03"), "audio/wav", "/x")).toBe(".wav");
  });

  it("falls back to the URL path when content-type is missing", () => {
    expect(resolveAudioExtension(Buffer.from("\x00\x01\x02\x03"), "", "/calls/recording.m4a")).toBe(
      ".m4a"
    );
  });

  it("throws (never returns .audio) when the format is unidentifiable", () => {
    expect(() => resolveAudioExtension(Buffer.from("\x00\x01\x02\x03"), "", "/recording")).toThrow(
      "Could not determine a supported audio format"
    );
  });
});

describe("fetchRecordingWithGuards", () => {
  it("fetches a direct mp3", async () => {
    stubFetchSequence([
      () => fakeResponse({ body: Buffer.from("ID3 mp3 payload"), headers: { "content-type": "audio/mpeg" } }),
    ]);
    const result = await fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB });
    expect(result.extension).toBe(".mp3");
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.bytes.toString()).toContain("ID3");
  });

  it("detects wav from an octet-stream response via magic bytes", async () => {
    stubFetchSequence([
      () => fakeResponse({ body: wavBytes(), headers: { "content-type": "application/octet-stream" } }),
    ]);
    const result = await fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB });
    expect(result.extension).toBe(".wav");
    expect(result.contentType).toBe("audio/wav");
  });

  it("follows a redirect to S3 and re-validates the hop", async () => {
    const fn = stubFetchSequence([
      () =>
        fakeResponse({
          status: 302,
          headers: { location: "https://ringba-recordings.s3.amazonaws.com/x.mp3" },
        }),
      () => fakeResponse({ body: Buffer.from("ID3 payload"), headers: { "content-type": "audio/mpeg" } }),
    ]);
    const result = await fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB });
    expect(result.extension).toBe(".mp3");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rejects a redirect that targets a private host (SSRF via Location)", async () => {
    stubFetchSequence([
      () => fakeResponse({ status: 302, headers: { location: "http://169.254.169.254/latest/meta" } }),
    ]);
    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB })
    ).rejects.toThrow("private or loopback");
  });

  it("rejects a redirect that leaves the host allowlist", async () => {
    process.env.RECORDING_HOST_ALLOWLIST = "ringba.com";
    stubFetchSequence([
      () => fakeResponse({ status: 302, headers: { location: "https://evil.example.com/x.mp3" } }),
    ]);
    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB })
    ).rejects.toThrow("not in the allowlist");
    delete process.env.RECORDING_HOST_ALLOWLIST;
  });

  it("rejects after exceeding the redirect budget", async () => {
    const redirect = () =>
      fakeResponse({ status: 302, headers: { location: "https://media.ringba.com/next" } });
    stubFetchSequence([redirect, redirect, redirect, redirect, redirect, redirect, redirect]);
    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB, maxRedirects: 5 })
    ).rejects.toThrow("maximum of 5 redirects");
  });

  it("rejects via Content-Length before reading the body", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    // The precheck path must cancel the body, not stream it: assert getReader
    // (the streaming entry point) is never invoked.
    const getReaderSpy = vi.spyOn(body, "getReader");
    const response = {
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "audio/mpeg", "content-length": String(30 * MB) }),
      body,
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));

    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB })
    ).rejects.toThrow("exceeds the maximum allowed size of 25 MB");
    expect(getReaderSpy).not.toHaveBeenCalled(); // body never streamed
  });

  it("rejects when the streamed body exceeds the cap without a Content-Length", async () => {
    stubFetchSequence([
      () =>
        fakeResponse({
          body: Buffer.from(`ID3${"x".repeat(200)}`),
          headers: { "content-type": "audio/mpeg" },
        }),
    ]);
    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 16 })
    ).rejects.toThrow("exceeds the maximum allowed size");
  });

  it.each([400, 401, 403, 404, 410])("treats HTTP %i as non-retryable", async (status) => {
    stubFetchSequence([() => fakeResponse({ status, body: Buffer.from("nope") })]);
    try {
      await fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB });
      throw new Error("expected fetchRecordingWithGuards to throw");
    } catch (error) {
      expect((error as { retryable?: boolean }).retryable).toBe(false);
      expect((error as Error).message).toContain(`Upstream returned ${status}`);
    }
  });

  it("treats HTTP 500 as retryable", async () => {
    stubFetchSequence([() => fakeResponse({ status: 500, body: Buffer.from("err") })]);
    try {
      await fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB });
      throw new Error("expected fetchRecordingWithGuards to throw");
    } catch (error) {
      expect((error as { retryable?: boolean }).retryable).toBeUndefined();
      expect((error as Error).message).toContain("Upstream returned 500");
    }
  });

  it("treats a network/timeout failure as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      })
    );
    try {
      await fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB });
      throw new Error("expected fetchRecordingWithGuards to throw");
    } catch (error) {
      expect((error as { retryable?: boolean }).retryable).toBeUndefined();
      expect((error as Error).message).toContain("Unable to reach the recording host");
    }
  });

  it("rejects a public host that resolves to a private IP (SSRF via DNS)", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }] as never);
    const fn = vi.fn(async () => fakeResponse({ body: Buffer.from("ID3"), headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fn);
    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB })
    ).rejects.toThrow("resolves to a private or loopback address");
    expect(fn).not.toHaveBeenCalled(); // rejected before any connection
  });

  it("rejects when a redirect target's host resolves to a private IP", async () => {
    // Original host resolves public; the S3 redirect target resolves private.
    vi.mocked(lookup)
      .mockResolvedValueOnce(PUBLIC_ADDR as never)
      .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }] as never);
    stubFetchSequence([
      () => fakeResponse({ status: 302, headers: { location: "https://attacker.example.com/x.mp3" } }),
    ]);
    await expect(
      fetchRecordingWithGuards("https://media.ringba.com/r", { maxBytes: 25 * MB })
    ).rejects.toThrow("resolves to a private or loopback address");
  });

  it("skips the DNS lookup for an IP-literal host", async () => {
    stubFetchSequence([
      () => fakeResponse({ body: Buffer.from("ID3 payload"), headers: { "content-type": "audio/mpeg" } }),
    ]);
    const result = await fetchRecordingWithGuards("https://93.184.216.34/r", { maxBytes: 25 * MB });
    expect(result.extension).toBe(".mp3");
    expect(vi.mocked(lookup)).not.toHaveBeenCalled(); // literal already validated
  });

  it("sends auth only to an authorized host and never forwards it across a redirect", async () => {
    const authSeen: Array<string | null> = [];
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      const header = (init.headers as Record<string, string>)?.Authorization ?? null;
      authSeen.push(header);
      if (authSeen.length === 1) {
        return fakeResponse({
          status: 302,
          headers: { location: "https://ringba-recordings.s3.amazonaws.com/x.mp3" },
        });
      }
      return fakeResponse({ body: Buffer.from("ID3 payload"), headers: { "content-type": "audio/mpeg" } });
    });
    vi.stubGlobal("fetch", fn);

    await fetchRecordingWithGuards("https://media.ringba.com/r", {
      maxBytes: 25 * MB,
      auth: { token: "secret-token", hostIsAuthorized: (host) => host.endsWith("ringba.com") },
    });

    expect(authSeen[0]).toBe("Token secret-token"); // first hop, authorized Ringba host
    expect(authSeen[1]).toBe(null); // not forwarded to the S3 redirect target
  });
});
