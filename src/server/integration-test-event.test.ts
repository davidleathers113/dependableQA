import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildIntegrationTestEvent } from "./integration-test-event";
import { verifyWebhookRequest, type IntegrationContext, type WebhookAuthConfig } from "./integration-ingest";

function createIntegration(overrides: Partial<IntegrationContext> = {}): IntegrationContext {
  return {
    id: "integration-1",
    organizationId: "org-1",
    provider: "ringba",
    displayName: "Ringba",
    config: {},
    ...overrides,
  };
}

function createAuthConfig(overrides: Partial<WebhookAuthConfig> = {}): WebhookAuthConfig {
  return {
    type: "hmac-sha256",
    secret: "top-secret",
    headerName: "x-dependableqa-signature",
    prefix: "sha256=",
    ...overrides,
  };
}

describe("buildIntegrationTestEvent", () => {
  it("creates a valid signed HMAC test event", () => {
    const integration = createIntegration();
    const authConfig = createAuthConfig();

    const testEvent = buildIntegrationTestEvent(integration, authConfig);
    const verification = verifyWebhookRequest(testEvent.headers, testEvent.rawBody, authConfig);

    expect(verification).toEqual({ ok: true });
    expect(testEvent.payload).toMatchObject({
      provider: "ringba",
      eventType: "webhook.test",
    });
  });

  it("creates a valid signed shared-secret test event", () => {
    const integration = createIntegration({ provider: "custom", displayName: "Custom inbound" });
    const authConfig = createAuthConfig({
      type: "shared-secret",
      headerName: "x-webhook-secret",
      prefix: "Bearer ",
      secret: "shared-secret-value",
    });

    const testEvent = buildIntegrationTestEvent(integration, authConfig);
    const verification = verifyWebhookRequest(testEvent.headers, testEvent.rawBody, authConfig);

    expect(verification).toEqual({ ok: true });
    expect(testEvent.headers["x-webhook-secret"]).toBe("Bearer shared-secret-value");
  });
});

describe("sendIntegrationTestEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("fails when no effective secret is configured", async () => {
    const recordIntegrationFailure = vi.fn().mockResolvedValue("event-1");

    vi.doMock("../lib/app-data", () => ({
      insertAuditLog: vi.fn(),
    }));
    vi.doMock("./integration-ingest", () => ({
      loadIntegrationContext: vi.fn().mockResolvedValue(createIntegration()),
      getWebhookAuthConfig: vi.fn().mockReturnValue(null),
      recordIntegrationFailure,
      recordIntegrationEvent: vi.fn(),
      updateIntegrationStatus: vi.fn(),
      verifyWebhookRequest: vi.fn(),
    }));

    const { sendIntegrationTestEvent } = await import("./integration-test-event");

    await expect(sendIntegrationTestEvent({} as never, "integration-1")).rejects.toThrow(
      "A secret must be configured before a test event can be generated."
    );
    expect(recordIntegrationFailure).toHaveBeenCalledOnce();
  });
});
