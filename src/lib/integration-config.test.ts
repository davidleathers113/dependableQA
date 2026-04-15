import { describe, expect, it } from "vitest";
import {
  DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
  DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS,
  RINGBA_API_LOOKBACK_DEFAULT_HOURS,
  RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES,
  getPublicIntegrationRingbaConfig,
  getPublicIntegrationWebhookAuth,
  mergeRingbaApiLastSyncAt,
  normalizeIntegrationRingbaConfigInput,
  normalizeIntegrationWebhookAuthInput,
} from "./integration-config";

describe("integration-config", () => {
  it("reports environment fallback secrets without exposing them", () => {
    const summary = getPublicIntegrationWebhookAuth(
      {
        webhookAuth: {
          type: "hmac-sha256",
          headerName: "x-custom-signature",
          prefix: "sha256=",
        },
      },
      {
        fallbackSecretConfigured: true,
      }
    );

    expect(summary).toEqual({
      authType: "hmac-sha256",
      headerName: "x-custom-signature",
      prefix: "sha256=",
      secretConfigured: true,
      secretSource: "environment",
    });
  });

  it("normalizes webhook auth into the canonical config shape", () => {
    const nextConfig = normalizeIntegrationWebhookAuthInput(
      {
        signingSecret: "legacy-secret",
        signatureHeader: "x-legacy-signature",
        signaturePrefix: "sha256=",
        endpoint: "/.netlify/functions/integration-ingest",
      },
      {
        authType: "shared-secret",
        headerName: "x-webhook-secret",
        prefix: "",
        secret: "",
      }
    ) as Record<string, unknown>;

    expect(nextConfig.endpoint).toBe("/.netlify/functions/integration-ingest");
    expect(nextConfig.signingSecret).toBeUndefined();
    expect(nextConfig.signatureHeader).toBeUndefined();
    expect(nextConfig.signaturePrefix).toBeUndefined();
    expect(nextConfig.webhookAuth).toEqual({
      type: "shared-secret",
      headerName: "x-webhook-secret",
      prefix: "",
      secret: "legacy-secret",
    });
  });

  it("returns a public Ringba config summary with defaults", () => {
    expect(getPublicIntegrationRingbaConfig({})).toEqual({
      publicIngestKey: "",
      minimumDurationSeconds: DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS,
      ringbaApiSyncEnabled: false,
      ringbaAccountId: "",
      apiTokenConfigured: false,
      callLogsTimeZone: DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
      pollIntervalMinutes: RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES,
      lookbackHours: RINGBA_API_LOOKBACK_DEFAULT_HOURS,
      lastRingbaApiSyncAt: null,
    });
  });

  it("normalizes Ringba config without disturbing webhook auth", () => {
    const nextConfig = normalizeIntegrationRingbaConfigInput(
      {
        endpoint: "/.netlify/functions/integration-ingest",
        webhookAuth: {
          type: "hmac-sha256",
          headerName: "x-signature",
          prefix: "sha256=",
        },
      },
      {
        publicIngestKey: "ringba_live_key",
        minimumDurationSeconds: 45,
      }
    ) as Record<string, unknown>;

    expect(nextConfig.endpoint).toBe("/.netlify/functions/integration-ingest");
    expect(nextConfig.webhookAuth).toEqual({
      type: "hmac-sha256",
      headerName: "x-signature",
      prefix: "sha256=",
    });
    expect(nextConfig.ringba).toEqual({
      publicIngestKey: "ringba_live_key",
      minimumDurationSeconds: 45,
    });
  });

  it("retains Ringba API token when the incoming token is blank", () => {
    const nextConfig = normalizeIntegrationRingbaConfigInput(
      {
        ringba: {
          publicIngestKey: "ringba_live_key",
          apiAccessToken: "secret-token",
          minimumDurationSeconds: 30,
        },
      },
      {
        apiAccessToken: "",
        ringbaAccountId: "RA_account",
      }
    ) as Record<string, unknown>;

    const ringba = nextConfig.ringba as Record<string, unknown>;
    expect(ringba.apiAccessToken).toBe("secret-token");
    expect(ringba.ringbaAccountId).toBe("RA_account");
  });

  it("merges last Ringba API sync timestamp into config", () => {
    const merged = mergeRingbaApiLastSyncAt(
      { ringba: { publicIngestKey: "k" } },
      "2026-04-13T12:00:00.000Z"
    ) as Record<string, unknown>;
    expect((merged.ringba as Record<string, unknown>).lastRingbaApiSyncAt).toBe("2026-04-13T12:00:00.000Z");
  });
});
