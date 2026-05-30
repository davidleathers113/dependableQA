import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalTime } from "./LocalTime";

describe("LocalTime", () => {
  it("renders a deterministic UTC value on the server (no tz/locale drift)", () => {
    // The SSR render must be stable so it matches the client's first paint.
    const html = renderToStaticMarkup(<LocalTime value="2026-04-13T19:21:06Z" />);
    // en-US + UTC of 19:21Z → "Apr 13, 07:21 PM".
    expect(html).toContain("Apr 13");
    expect(html).toContain("07:21");
    expect(html).toContain("PM");
    expect(html).toContain("<time");
    expect(html).toContain("2026-04-13T19:21:06Z"); // machine-readable dateTime attr
  });

  it("is independent of the process timezone (deterministic SSR)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      const la = renderToStaticMarkup(<LocalTime value="2026-04-13T19:21:06Z" />);
      process.env.TZ = "Asia/Tokyo";
      const tokyo = renderToStaticMarkup(<LocalTime value="2026-04-13T19:21:06Z" />);
      expect(la).toBe(tokyo); // same markup regardless of server tz
    } finally {
      process.env.TZ = original;
    }
  });

  it("renders the fallback for a missing or invalid value", () => {
    expect(renderToStaticMarkup(<LocalTime value={null} />)).toContain("—");
    expect(renderToStaticMarkup(<LocalTime value="not-a-date" fallback="n/a" />)).toContain("n/a");
  });

  it("honors date-only options", () => {
    const html = renderToStaticMarkup(
      <LocalTime value="2026-04-13T19:21:06Z" options={{ year: "numeric", month: "short", day: "numeric" }} />
    );
    expect(html).toContain("Apr 13, 2026");
    expect(html).not.toContain("PM");
  });
});
