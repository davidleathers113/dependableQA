import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CallGridInfoCard } from "./CallGridInfoCard";

describe("CallGridInfoCard", () => {
  const html = renderToStaticMarkup(<CallGridInfoCard />);

  it("presents CallGrid as a known provider that needs account docs", () => {
    expect(html).toContain("CallGrid");
    expect(html).toContain("Needs account docs");
  });

  it("distinguishes the verified RTB/bid API from unverified historical import", () => {
    // Verified surface.
    expect(html).toContain("bid API");
    expect(html).toContain("bid.callgrid.com/api/bid/");
    // Unverified surface, framed as expected — not a bug.
    expect(html).toContain("historical call-log/recording import");
    expect(html).toContain("not built yet");
    expect(html).toContain("not a bug");
  });

  it("directs the operator to share credentials or use the custom webhook path", () => {
    expect(html).toContain("API documentation or credentials");
    expect(html).toContain("custom signed webhook");
  });
});
