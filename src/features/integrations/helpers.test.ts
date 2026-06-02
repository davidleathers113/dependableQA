import { describe, expect, it } from "vitest";
import type { IntegrationCard } from "../../lib/app-data";
import {
  DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
  RINGBA_API_LOOKBACK_DEFAULT_HOURS,
  RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES,
} from "../../lib/integration-config";
import {
  getDiagnosticsSummary,
  getDiagnosticsSummaryLine,
  getIntegrationCapabilities,
  getIntegrationChecklist,
  getIntegrationHealth,
  getIntegrationLatestEventText,
  getIntegrationLatestStatusLabel,
  getIntegrationNextStep,
  getIntegrationPreTrafficGuide,
  getRingbaPixelUrl,
  getIntegrationSummaryMeta,
  getSecretSourceLabel,
} from "./helpers";

function defaultRingbaFields(): IntegrationCard["ringba"] {
  return {
    publicIngestKey: "",
    minimumDurationSeconds: 30,
    ringbaApiSyncEnabled: false,
    ringbaAccountId: "",
    apiTokenConfigured: false,
    callLogsTimeZone: DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
    pollIntervalMinutes: RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES,
    lookbackHours: RINGBA_API_LOOKBACK_DEFAULT_HOURS,
    lastRingbaApiSyncAt: null,
  };
}

function rb(overrides: Partial<IntegrationCard["ringba"]>): IntegrationCard["ringba"] {
  return { ...defaultRingbaFields(), ...overrides };
}

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
    ringba: { ...defaultRingbaFields(), ...ringbaOverrides },
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
      ringba: rb({
        publicIngestKey: "ringba_live_key",
        minimumDurationSeconds: 30,
      }),
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
        ringba: rb({
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        }),
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
        ringba: rb({
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        }),
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
      ringba: rb({
        publicIngestKey: "ringba_live_key",
        minimumDurationSeconds: 30,
      }),
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
        ringba: rb({
          publicIngestKey: "ringba_live_key",
          minimumDurationSeconds: 30,
        }),
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
      "https://dependableqa.netlify.app/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=ringba&call_id=[Call:InboundCallId]&caller_number=[tag:InboundNumber:Number]&duration_seconds=[tag:CallLength:Total]&recording_url=[Call:RecordingUrl]&campaign_name=[tag:Campaign:Name]&call_timestamp=[Call:CallConnectedTimestamp]&call_connection_dt=[Call:CallConnectionDt]&publisher_name=[tag:Publisher:Name]"
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

describe("getIntegrationPreTrafficGuide", () => {
  it("points a created-but-uncredentialed Ringba integration at the next verification", () => {
    const integration = createIntegration(); // created, no API token yet
    const guide = getIntegrationPreTrafficGuide(integration);

    expect(guide.verifyNow).toEqual({
      action: "Add credentials",
      detail: expect.stringContaining("Ringba Account ID"),
      location: "API sync tab",
      targetTab: "api",
    });
    // Provider-accurate: Ringba parses recording/duration/campaign fields.
    expect(guide.afterFirstCall.join(" ")).toContain("recording link");
    expect(guide.noDataMeaning).toContain("expected");
    expect(guide.noDataMeaning).toContain("API token");
  });

  it("clears the verify-now action once all required steps are done", () => {
    const integration = createIntegration({
      ringba: rb({ apiTokenConfigured: true, ringbaAccountId: "acct_1", lastRingbaApiSyncAt: "2026-06-01T00:00:00.000Z" }),
      lastSuccessAt: "2026-06-01T00:00:00.000Z",
    });

    const guide = getIntegrationPreTrafficGuide(integration);
    expect(guide.verifyNow).toBeNull();
    // Expectations still render even when there's nothing left to verify.
    expect(guide.afterFirstCall.length).toBeGreaterThan(0);
  });

  it("gives webhook providers generic, non-invented expectations and a security CTA", () => {
    const integration = createIntegration({
      provider: "retreaver",
      displayName: "Retreaver",
    });

    const guide = getIntegrationPreTrafficGuide(integration);
    expect(guide.verifyNow).toEqual({
      action: "Configure security",
      detail: expect.stringContaining("request signing"),
      location: "Security tab",
      targetTab: "security",
    });
    // Must NOT claim Ringba-specific parsed fields for other providers.
    expect(guide.afterFirstCall.join(" ")).not.toContain("recording link");
    expect(guide.afterFirstCall.join(" ")).toContain("event type");
    expect(guide.noDataMeaning).toContain("webhook");
    expect(guide.noDataMeaning).toContain("signing secret");
  });
});

describe("integration setup guidance", () => {
  it("guides an unconfigured Ringba placeholder to create first", () => {
    const integration = createIntegration({ isConfigured: false, isCatalogPlaceholder: true });

    expect(getIntegrationChecklist(integration).every((item) => !item.done)).toBe(true);

    const next = getIntegrationNextStep(integration);
    expect(next.complete).toBe(false);
    expect(next.cta).toEqual({ label: "Create integration", targetTab: "overview" });
  });

  it("advances to verify once Ringba credentials are saved but unsynced", () => {
    const integration = createIntegration({
      ringba: rb({ apiTokenConfigured: true, ringbaAccountId: "RA123" }),
    });
    const byId = Object.fromEntries(getIntegrationChecklist(integration).map((item) => [item.id, item.done]));

    expect(byId.create).toBe(true);
    expect(byId.credentials).toBe(true);
    expect(byId.verify).toBe(false);
    expect(getIntegrationNextStep(integration).cta).toEqual({ label: "Test connection", targetTab: "api" });
  });

  it("treats a completed sync watermark as a verified connection", () => {
    const integration = createIntegration({
      ringba: rb({
        apiTokenConfigured: true,
        ringbaAccountId: "RA123",
        lastRingbaApiSyncAt: "2026-04-10T00:00:00.000Z",
      }),
    });
    const verify = getIntegrationChecklist(integration).find((item) => item.id === "verify");

    expect(verify?.done).toBe(true);
  });

  it("keeps pixel and scheduled-sync steps optional", () => {
    const optional = getIntegrationChecklist(createIntegration())
      .filter((item) => item.optional)
      .map((item) => item.id);

    expect(optional).toEqual(["pixel", "schedule"]);
  });

  it("reports Ringba capabilities independently (API vs pixel vs sync)", () => {
    const integration = createIntegration({
      ringba: rb({
        apiTokenConfigured: true,
        ringbaAccountId: "RA123",
        lastRingbaApiSyncAt: "2026-04-10T00:00:00.000Z",
        ringbaApiSyncEnabled: true,
        publicIngestKey: "",
      }),
    });
    const caps = Object.fromEntries(getIntegrationCapabilities(integration).map((capability) => [capability.key, capability.state]));

    expect(caps.api).toBe("ready");
    expect(caps.pixel).toBe("inactive");
    expect(caps.sync).toBe("ready");
  });

  it("flags Ringba capabilities for attention on recent errors", () => {
    const integration = createIntegration({
      ringba: rb({ apiTokenConfigured: true, ringbaAccountId: "RA123" }),
      recentEvents: [
        { id: "event-1", eventType: "ringba.sync", severity: "error", message: "boom", createdAt: "2026-04-10T00:00:00.000Z" },
      ],
    });
    const api = getIntegrationCapabilities(integration).find((capability) => capability.key === "api");

    expect(api?.state).toBe("attention");
  });

  it("builds a webhook-oriented checklist and capabilities for non-Ringba providers", () => {
    const integration = createIntegration({
      provider: "trackdrive",
      webhookAuth: {
        authType: "hmac-sha256",
        headerName: "x-sig",
        prefix: "sha256=",
        secretConfigured: true,
        secretSource: "integration",
      },
    });

    expect(getIntegrationChecklist(integration).map((item) => item.id)).toEqual(["create", "security", "first-event"]);
    expect(getIntegrationNextStep(integration).cta).toEqual({ label: "Send a test event", targetTab: "setup" });
    expect(getIntegrationCapabilities(integration).map((capability) => capability.key)).toEqual(["auth", "events"]);
  });

  it("declares completion when all required steps are done", () => {
    const integration = createIntegration({
      ringba: rb({
        apiTokenConfigured: true,
        ringbaAccountId: "RA123",
        lastRingbaApiSyncAt: "2026-04-10T00:00:00.000Z",
      }),
      lastSuccessAt: "2026-04-10T00:00:00.000Z",
    });
    const next = getIntegrationNextStep(integration);

    expect(next.complete).toBe(true);
    expect(next.cta).toBeNull();
  });
});
