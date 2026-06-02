import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IntegrationCard } from "../../../lib/app-data";
import { IntegrationDiagnosticsPanel } from "./IntegrationDiagnosticsPanel";

function createIntegration(overrides: Partial<IntegrationCard> = {}): IntegrationCard {
  const { ringba: ringbaOverrides, ...rest } = overrides;
  return {
    id: "integration-1",
    isConfigured: true,
    isCatalogPlaceholder: false,
    displayName: "Ringba",
    provider: "ringba",
    status: "connected",
    mode: "live",
    lastSuccessAt: null,
    lastErrorAt: null,
    lastEventMessage: null,
    lastEventSeverity: null,
    webhookAuth: {
      authType: "hmac-sha256",
      headerName: "x-dependableqa-signature",
      prefix: "sha256=",
      secretConfigured: false,
      secretSource: "none",
    },
    recentEvents: [],
    ...rest,
    ringba: {
      publicIngestKey: "",
      minimumDurationSeconds: 30,
      ringbaApiSyncEnabled: false,
      ringbaAccountId: "",
      apiTokenConfigured: false,
      callLogsTimeZone: "UTC",
      pollIntervalMinutes: 60,
      lookbackHours: 48,
      lastRingbaApiSyncAt: null,
      ...ringbaOverrides,
    },
  };
}

describe("IntegrationDiagnosticsPanel pre-traffic state", () => {
  it("shows the pre-traffic guide (not an error) when a configured integration has no events", () => {
    const html = renderToStaticMarkup(<IntegrationDiagnosticsPanel integration={createIntegration()} />);
    expect(html).toContain("No calls have arrived yet");
    expect(html).toContain("Verify before live traffic");
    expect(html).toContain("see after the first call");
    // Ringba-accurate expectation copy.
    expect(html).toContain("recording link");
    // Frames an empty list as expected, not broken.
    expect(html).toContain("does not mean the connection is broken");
  });

  it("renders the verify-now callout as a navigation button when onNavigate is provided", () => {
    const html = renderToStaticMarkup(
      <IntegrationDiagnosticsPanel integration={createIntegration()} onNavigate={() => {}} />
    );
    expect(html).toContain("<button");
    expect(html).toContain("Verify before live traffic");
    // Button copy invites navigation to the target tab.
    expect(html).toContain("Go to API sync tab");
  });

  it("renders the verify-now callout as static text (no dead button) without onNavigate", () => {
    const html = renderToStaticMarkup(<IntegrationDiagnosticsPanel integration={createIntegration()} />);
    expect(html).toContain("Verify before live traffic");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Go to");
  });

  it("renders expectations without any verify-now control once required steps are done", () => {
    const allDone = createIntegration({
      lastSuccessAt: "2026-06-01T00:00:00.000Z",
      ringba: {
        publicIngestKey: "key",
        minimumDurationSeconds: 30,
        ringbaApiSyncEnabled: false,
        ringbaAccountId: "acct_1",
        apiTokenConfigured: true,
        callLogsTimeZone: "UTC",
        pollIntervalMinutes: 60,
        lookbackHours: 48,
        lastRingbaApiSyncAt: "2026-06-01T00:00:00.000Z",
      },
    });
    const html = renderToStaticMarkup(<IntegrationDiagnosticsPanel integration={allDone} onNavigate={() => {}} />);
    expect(html).toContain("No calls have arrived yet");
    expect(html).not.toContain("Verify before live traffic");
    expect(html).not.toContain("<button");
  });

  it("keeps the connect prompt when the integration is not configured", () => {
    const html = renderToStaticMarkup(
      <IntegrationDiagnosticsPanel integration={createIntegration({ isConfigured: false, isCatalogPlaceholder: true })} />
    );
    expect(html).toContain("Connect this provider");
    expect(html).not.toContain("No calls have arrived yet");
  });

  it("shows real events (and not the pre-traffic guide) once traffic arrives", () => {
    const html = renderToStaticMarkup(
      <IntegrationDiagnosticsPanel
        integration={createIntegration({
          lastSuccessAt: "2026-06-01T00:00:00.000Z",
          recentEvents: [
            {
              id: "evt_1",
              eventType: "pixel.accepted",
              severity: "info",
              message: "Call accepted from pixel",
              createdAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        })}
      />
    );
    expect(html).toContain("Call accepted from pixel");
    expect(html).not.toContain("No calls have arrived yet");
  });
});
