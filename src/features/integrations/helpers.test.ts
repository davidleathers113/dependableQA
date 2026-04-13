import { describe, expect, it } from "vitest";
import type { IntegrationCard } from "../../lib/app-data";
import {
  getDiagnosticsSummary,
  getDiagnosticsSummaryLine,
  getIntegrationHealth,
  getIntegrationLatestEventText,
  getIntegrationLatestStatusLabel,
  getRingbaPixelUrl,
  getIntegrationSummaryMeta,
  getSecretSourceLabel,
} from "./helpers";

function createIntegration(overrides: Partial<IntegrationCard> = {}): IntegrationCard {
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
    ringba: {
      publicIngestKey: "",
      minimumDurationSeconds: 30,
    },
    recentEvents: [],
    ...overrides,
  };
}

describe("integration helpers", () => {
  it("derives needs configuration when no secret is configured", () => {
    const health = getIntegrationHealth(createIntegration());

    expect(health).toEqual({
      state: "needs-configuration",
      label: "Needs configuration",
      description: "Ringba pixel setup is incomplete because this integration does not have a public ingest key yet.",
    });
  });

  it("derives needs configuration for catalog placeholders", () => {
    const integration = createIntegration({
      isConfigured: false,
      isCatalogPlaceholder: true,
    });
    const health = getIntegrationHealth(integration);

    expect(health).toEqual({
      state: "needs-configuration",
      label: "Not connected",
      description: "Connect this provider to generate the Ringba pixel URL and start receiving call events.",
    });
    expect(getIntegrationLatestStatusLabel(integration)).toBe("Not connected yet");
    expect(getIntegrationLatestEventText(integration)).toBe("Connect this provider to generate the Ringba pixel URL.");
    expect(getDiagnosticsSummaryLine(integration)).toBe("Connect this provider to start receiving diagnostics.");
  });

  it("derives awaiting first event when auth is ready but no success exists", () => {
    const integration = createIntegration({
      ringba: {
        publicIngestKey: "ringba_live_key",
        minimumDurationSeconds: 30,
      },
    });
    const health = getIntegrationHealth(integration);

    expect(health.state).toBe("awaiting-first-event");
    expect(health.label).toBe("Awaiting first event");
    expect(getIntegrationLatestEventText(integration)).toBe(
      "Configuration is complete. Waiting for the first Ringba pixel event."
    );
    expect(getDiagnosticsSummaryLine(integration)).toBe(
      "Configuration is complete. Waiting for the first Ringba pixel event."
    );
  });

  it("derives healthy when a secret is configured and a success exists", () => {
    const health = getIntegrationHealth(
      createIntegration({
        ringba: {
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        },
        lastSuccessAt: "2026-04-10T00:00:00.000Z",
      })
    );

    expect(health.state).toBe("healthy");
    expect(getSecretSourceLabel("environment")).toBe("Environment fallback");
  });

  it("derives error when the last event severity is error", () => {
    const health = getIntegrationHealth(
      createIntegration({
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: true,
          secretSource: "integration",
        },
        lastEventSeverity: "error",
      })
    );

    expect(health.state).toBe("error");
  });

  it("summarizes recent event counts", () => {
    const summary = getDiagnosticsSummary(
      createIntegration({
        recentEvents: [
          {
            id: "event-1",
            eventType: "webhook.accepted",
            severity: "info",
            message: "Accepted",
            createdAt: "2026-04-10T00:00:00.000Z",
          },
          {
            id: "event-2",
            eventType: "webhook.warning",
            severity: "warning",
            message: "Delayed",
            createdAt: "2026-04-09T00:00:00.000Z",
          },
          {
            id: "event-3",
            eventType: "webhook.error",
            severity: "error",
            message: "Rejected",
            createdAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      })
    );

    expect(summary).toEqual({
      successCount: 1,
      warningCount: 1,
      errorCount: 1,
      lastReceivedAt: "2026-04-10T00:00:00.000Z",
    });
  });

  it("builds summary metadata for the summary card layer", () => {
    const meta = getIntegrationSummaryMeta(
      createIntegration({
        ringba: {
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        },
        lastSuccessAt: "2026-04-10T00:00:00.000Z",
      })
    );

    expect(meta.setupModelDescription).toBe("Public GET pixel ingest with Ringba query-string tags.");
    expect(meta.latestStatusLabel.startsWith("Last success:")).toBe(true);
    expect(meta.primaryActionLabel).toBe("Reconfigure");
  });

  it("uses connect as the summary action for placeholders", () => {
    const meta = getIntegrationSummaryMeta(
      createIntegration({
        isConfigured: false,
        isCatalogPlaceholder: true,
      })
    );

    expect(meta.primaryActionLabel).toBe("Connect");
  });

  it("shows recent event recorded when timestamps are missing but recent events exist", () => {
    const meta = getIntegrationSummaryMeta(
      createIntegration({
        recentEvents: [
          {
            id: "event-1",
            eventType: "webhook.test.accepted",
            severity: "info",
            message: "Test event accepted.",
            createdAt: "2026-04-10T00:00:00.000Z",
          },
        ],
      })
    );

    expect(meta.latestStatusLabel).toBe("Recent event recorded");
  });

  it("surfaces recent warning activity when warnings exist without timestamps", () => {
    const integration = createIntegration({
      ringba: {
        publicIngestKey: "ringba_live_key",
        minimumDurationSeconds: 30,
      },
      recentEvents: [
        {
          id: "event-1",
          eventType: "webhook.warning",
          severity: "warning",
          message: "Delayed",
          createdAt: "2026-04-10T00:00:00.000Z",
        },
      ],
    });

    expect(getIntegrationHealth(integration).state).toBe("degraded");
    expect(getIntegrationLatestStatusLabel(integration)).toBe("Recent warning recorded");
    expect(getDiagnosticsSummaryLine(integration)).toBe(
      "Recent Ringba pixel events need attention. Review the latest messages below."
    );
  });

  it("prefers the newest success timestamp over an older error", () => {
    const meta = getIntegrationSummaryMeta(
      createIntegration({
        lastSuccessAt: "2026-04-10T00:00:00.000Z",
        lastErrorAt: "2026-04-09T00:00:00.000Z",
      })
    );

    expect(meta.latestStatusLabel.startsWith("Last success:")).toBe(true);
  });

  it("uses a warning-oriented diagnostics summary line for degraded integrations", () => {
    const line = getDiagnosticsSummaryLine(
      createIntegration({
        ringba: {
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        },
        lastEventSeverity: "warning",
        recentEvents: [
          {
            id: "event-1",
            eventType: "webhook.warning",
            severity: "warning",
            message: "Delayed",
            createdAt: "2026-04-09T00:00:00.000Z",
          },
        ],
      })
    );

    expect(line).toBe("Recent Ringba pixel events need attention. Review the latest messages below.");
  });

  it("builds the Ringba pixel URL with publisher on by default", () => {
    expect(
      getRingbaPixelUrl({
        origin: "https://dependableqa.netlify.app",
        publicIngestKey: "ringba_live_key",
        includePublisher: true,
        includeBuyer: false,
      })
    ).toBe(
      "https://dependableqa.netlify.app/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=ringba&call_id=[Call:InboundCallId]&caller_number=[Call:InboundPhoneNumber]&duration_seconds=[tag:CallLength:Total]&recording_url=[tag:Recording:RecordingUrl]&campaign_name=[tag:Campaign:Name]&call_timestamp=[Call:CallConnectionTime]&publisher_name=[tag:Publisher:Name]"
    );
  });

  it("appends buyer_name only when the Ringba buyer toggle is enabled", () => {
    const url = getRingbaPixelUrl({
      origin: "https://dependableqa.netlify.app",
      publicIngestKey: "ringba_live_key",
      includePublisher: true,
      includeBuyer: true,
    });

    expect(url.includes("&publisher_name=[tag:Publisher:Name]")).toBe(true);
    expect(url.endsWith("&buyer_name=[tag:Buyer:Name]")).toBe(true);
  });
});
