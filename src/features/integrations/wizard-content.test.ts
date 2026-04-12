import { describe, expect, it } from "vitest";
import {
  getRetreaverWizardSteps,
  getRingbaWizardSteps,
  getTrackDriveApiWizardSteps,
  getTrackDriveManualWizardSteps,
} from "./wizard-content";

describe("integration wizard content", () => {
  it("builds TrackDrive API-key steps with subdomain context", () => {
    const steps = getTrackDriveApiWizardSteps("acme");

    expect(steps).toHaveLength(4);
    expect(steps[0]?.description.includes("acme.trackdrive.com")).toBe(true);
    expect(steps[2]?.bullets).toContain("Offers: required so DependableQA can create webhooks");
  });

  it("builds TrackDrive manual steps with the full webhook endpoint", () => {
    const steps = getTrackDriveManualWizardSteps("https://app.example.com/.netlify/functions/integration-ingest");

    expect(steps).toHaveLength(5);
    expect(steps[4]?.bullets).toContain(
      "Webhook URL: https://app.example.com/.netlify/functions/integration-ingest"
    );
  });

  it("builds Ringba wizard steps with the endpoint copy step", () => {
    const steps = getRingbaWizardSteps();

    expect(steps).toHaveLength(14);
    expect(steps[4]).toMatchObject({
      sectionLabel: "Step 1: Create the pixel",
      title: "Copy the complete webhook URL",
      codeLabel: "Complete Webhook URL",
      showCopyButton: true,
    });
    expect(steps[8]?.sectionLabel).toBe("Step 2: Add pixel to campaigns");
    expect(steps[13]?.title).toBe("Wait for a real completed call, then test connection");
  });

  it("builds Retreaver wizard steps with buyer-connected guidance", () => {
    const steps = getRetreaverWizardSteps("https://app.example.com/.netlify/functions/integration-ingest");

    expect(steps).toHaveLength(5);
    expect(steps[2]?.description.includes("buyer")).toBe(true);
    expect(steps[4]?.bullets).toContain(
      "Webhook URL: https://app.example.com/.netlify/functions/integration-ingest"
    );
  });
});
