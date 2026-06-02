import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GettingStartedChecklist from "./GettingStartedChecklist";
import { deriveSetupChecklist } from "../../lib/app-data";

function render(input: Parameters<typeof deriveSetupChecklist>[0]) {
  return renderToStaticMarkup(<GettingStartedChecklist setup={deriveSetupChecklist(input)} />);
}

const NOTHING = {
  balanceCents: 0,
  hasIntegration: false,
  hasCalls: false,
  hasAnalyzedCall: false,
  hasReviewedCall: false,
};

describe("GettingStartedChecklist", () => {
  it("renders nothing once every setup step is complete", () => {
    const html = render({
      balanceCents: 5000,
      hasIntegration: true,
      hasCalls: true,
      hasAnalyzedCall: true,
      hasReviewedCall: true,
    });
    expect(html).toBe("");
  });

  it("shows progress and a CTA link for each incomplete step on a new org", () => {
    const html = render(NOTHING);
    expect(html).toContain("Getting started");
    expect(html).toContain("0 of 4 complete");
    // Each step's deep link is present so the user always knows where to go next.
    expect(html).toContain('href="/app/billing"');
    expect(html).toContain('href="/app/integrations"');
    expect(html).toContain('href="/app/calls"');
  });

  it("marks done steps and only links the remaining work", () => {
    const html = render({
      balanceCents: 5000,
      hasIntegration: true,
      hasCalls: true,
      hasAnalyzedCall: false,
      hasReviewedCall: false,
    });
    expect(html).toContain("2 of 4 complete");
    // Funded → the billing CTA is gone; analyze/review still link to the calls page.
    expect(html).not.toContain('href="/app/billing"');
    expect(html).toContain('href="/app/calls"');
    expect(html).toContain("Done");
  });
});
