import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PricingSummaryCard } from "./PricingSummaryCard";

function render(perMinuteRateCents: number) {
  return renderToStaticMarkup(<PricingSummaryCard perMinuteRateCents={perMinuteRateCents} />);
}

describe("PricingSummaryCard", () => {
  it("shows the per-minute rate and a worked example when metered", () => {
    const html = render(15);
    expect(html).toContain("How you&#x27;re billed");
    expect(html).toContain("$0.15");
    expect(html).toContain("per minute of analyzed audio");
    // Worked example: 3m 30s -> 4 billable minutes -> $0.60.
    expect(html).toContain("3m 30s");
    expect(html).toContain("$0.60");
  });

  it("explains the unmetered state when no rate is configured", () => {
    const html = render(0);
    expect(html).toContain("No per-minute rate is configured yet");
    // No worked example without a rate.
    expect(html).not.toContain("Example:");
    expect(html).not.toContain("per minute of analyzed audio");
  });

  it("always states that metadata import is free", () => {
    expect(render(15)).toContain("importing call metadata is free");
    expect(render(0)).toContain("importing call metadata is free");
  });
});
