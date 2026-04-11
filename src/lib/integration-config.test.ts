import { describe, expect, it } from "vitest";
import {
  getPublicIntegrationWebhookAuth,
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
});
