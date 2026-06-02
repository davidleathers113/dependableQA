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
      title: "Copy the complete pixel URL",
      codeLabel: "Complete Pixel URL",
      showCopyButton: true,
    });
    expect(steps[8]?.sectionLabel).toBe("Step 2: Add pixel to campaigns");
    expect(steps[13]?.title).toBe("Wait for a real completed call, then test connection");
  });

  const stepsText = (steps: ReturnType<typeof getRetreaverWizardSteps>) =>
    steps.flatMap((step) => [step.title, step.description, step.note ?? "", ...(step.bullets ?? [])]).join("\n");

  it("builds Retreaver wizard steps with buyer-connected guidance and actionable webhook details", () => {
    const steps = getRetreaverWizardSteps("https://app.example.com/.netlify/functions/integration-ingest");

    expect(steps).toHaveLength(8);
    expect(steps[2]?.description.includes("buyer")).toBe(true);
    expect(steps[4]?.bullets).toContain(
      "Webhook URL: https://app.example.com/.netlify/functions/integration-ingest"
    );

    const allText = stepsText(steps);
    expect(allText.includes("x-integration-id")).toBe(true);
    expect(allText.includes("sha256=")).toBe(true);
    expect(allText.includes("caller_id")).toBe(true);
    expect(allText.includes("call_uuid")).toBe(true);
    expect(allText.includes("recording_url")).toBe(true);
    expect(allText.includes("metadata-only")).toBe(true);
    expect(allText.includes("Diagnostics")).toBe(true);
  });

  it("without context, directs users to the Security tab and assumes the default signing header", () => {
    const allText = stepsText(getRetreaverWizardSteps("https://app.example.com/hook"));
    expect(allText.includes("copy its ID from the Security tab")).toBe(true);
    expect(allText.includes("x-dependableqa-signature")).toBe(true);
  });

  it("renders concrete live values when given integration context", () => {
    const steps = getRetreaverWizardSteps("https://app.example.com/hook", {
      integrationId: "int_abc123",
      authType: "hmac-sha256",
      headerName: "x-retreaver-signature",
      prefix: "sha256=",
      secretConfigured: true,
    });
    const allText = stepsText(steps);
    // The real integration id and configured header name are shown, not placeholders.
    expect(allText.includes("x-integration-id: int_abc123")).toBe(true);
    expect(allText.includes("x-retreaver-signature: send sha256=")).toBe(true);
  });

  it("warns when no signing secret is configured and never renders a secret value", () => {
    const steps = getRetreaverWizardSteps("https://app.example.com/hook", {
      integrationId: "int_abc123",
      authType: "shared-secret",
      headerName: "x-dependableqa-signature",
      secretConfigured: false,
    });
    const allText = stepsText(steps);
    expect(allText.includes("No signing secret is configured yet")).toBe(true);
    // Shared-secret guidance references "the configured shared secret value", not a literal secret.
    expect(allText.includes("send the configured shared secret value")).toBe(true);
  });
});
