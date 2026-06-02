import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IntegrationCard } from "../../../lib/app-data";
import { DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE } from "../../../lib/integration-config";
import { TrackDriveConnectWizard } from "./TrackDriveConnectWizard";

function trackDriveIntegration(): IntegrationCard {
  return {
    id: "integration-1",
    isConfigured: true,
    isCatalogPlaceholder: false,
    displayName: "TrackDrive",
    provider: "trackdrive",
    status: "connected",
    mode: "webhook",
    lastSuccessAt: null,
    lastErrorAt: null,
    lastEventMessage: null,
    lastEventSeverity: null,
    webhookAuth: {
      authType: "hmac-sha256",
      headerName: "x-dependableqa-signature",
      prefix: "sha256=",
      secretConfigured: true,
      secretSource: "integration",
    },
    ringba: {
      publicIngestKey: "",
      minimumDurationSeconds: 30,
      ringbaApiSyncEnabled: false,
      ringbaAccountId: "",
      apiTokenConfigured: false,
      callLogsTimeZone: DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
      pollIntervalMinutes: 60,
      lookbackHours: 48,
      lastRingbaApiSyncAt: null,
    },
    recentEvents: [],
  };
}

describe("TrackDriveConnectWizard", () => {
  it("renders temporary API credentials and connection-test guidance", () => {
    const html = renderToStaticMarkup(
      <TrackDriveConnectWizard
        integration={trackDriveIntegration()}
        isOpen
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    expect(html).toContain("Connect TrackDrive");
    expect(html).toContain("TrackDrive subdomain");
    expect(html).toContain("Public key");
    expect(html).toContain("Private key");
    expect(html).toContain("Test API connection");
    expect(html).toContain("The keys are not saved by this wizard.");
  });

  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      <TrackDriveConnectWizard
        integration={trackDriveIntegration()}
        isOpen={false}
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    expect(html).toBe("");
  });
});
