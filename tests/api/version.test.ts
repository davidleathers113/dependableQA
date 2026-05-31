import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET } from "../../src/pages/api/version";

function ctx(): APIContext {
  return { request: new Request("http://localhost/api/version") } as APIContext;
}

describe("GET /api/version", () => {
  it("returns commit + build time as JSON without auth", async () => {
    const response = await GET(ctx());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as { commit: string; builtAt: string };
    // The Vite `define` does not run under vitest, so the typeof guard yields
    // "unknown" here — the build inlines the real SHA. This asserts the wiring,
    // not the value.
    expect(typeof body.commit).toBe("string");
    expect(body.commit.length).toBeGreaterThan(0);
    expect(typeof body.builtAt).toBe("string");
  });
});
