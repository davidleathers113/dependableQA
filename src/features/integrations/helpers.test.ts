import { describe, expect, it } from "vitest";
import type { IntegrationCard } from "../../lib/app-data";
import {
  getDiagnosticsSummary,
  getDiagnosticsSummaryLine,
  getIntegrationHealth,
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
      description: "Webhook signing is incomplete, so inbound events cannot be trusted yet.",
    });
  });

  it("derives needs configuration for catalog placeholders", () => {
    const health = getIntegrationHealth(
      createIntegration({
        isConfigured: false,
        isCatalogPlaceholder: true,
      })
    );

    expect(health).toEqual({
      state: "needs-configuration",
      label: "Needs configuration",
      description: "This provider has not been configured yet.",
    });
  });

  it("derives awaiting first event when auth is ready but no success exists", () => {
    const health = getIntegrationHealth(
      createIntegration({
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: true,
          secretSource: "integration",
        },
      })
    );

    expect(health.state).toBe("awaiting-first-event");
    expect(health.label).toBe("Awaiting first event");
  });

  it("derives healthy when a secret is configured and a success exists", () => {
    const health = getIntegrationHealth(
      createIntegration({
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: true,
          secretSource: "environment",
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
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: true,
          secretSource: "integration",
        },
        lastSuccessAt: "2026-04-10T00:00:00.000Z",
      })
    );

    expect(meta.setupModelDescription).toBe("Webhook ingest with signed provider payloads.");
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
        webhookAuth: {
          authType: "hmac-sha256",
          headerName: "x-dependableqa-signature",
          prefix: "sha256=",
          secretConfigured: true,
          secretSource: "integration",
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

    expect(line).toBe("Recent webhook events need attention. Review the latest messages below.");
  });
});
