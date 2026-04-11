import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../supabase/types";
import { insertAuditLog } from "../lib/app-data";
import { createHmacSha256Hex } from "./netlify-request";
import {
  getWebhookAuthConfig,
  loadIntegrationContext,
  recordIntegrationEvent,
  recordIntegrationFailure,
  updateIntegrationStatus,
  verifyWebhookRequest,
  type IntegrationContext,
} from "./integration-ingest";

type SupabaseAny = SupabaseClient<Database>;

const TEST_EVENT_TIMESTAMP = "2026-01-01T00:00:00.000Z";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildProviderPayload(integration: IntegrationContext): Record<string, unknown> {
  const baseCall = {
    callerNumber: "+15555550123",
    destinationNumber: "+15555550999",
    startedAt: TEST_EVENT_TIMESTAMP,
    durationSeconds: 120,
    campaignName: `${integration.displayName} Test Campaign`,
    publisherName: "DependableQA Test Publisher",
    externalCallId: `test-${integration.id}`,
  };

  if (integration.provider === "ringba") {
    return {
      provider: "ringba",
      eventType: "webhook.test",
      ringbaCampaignId: "ringba-test-campaign",
      calls: [baseCall],
    };
  }

  if (integration.provider === "trackdrive") {
    return {
      provider: "trackdrive",
      eventType: "webhook.test",
      leadId: "trackdrive-test-lead",
      calls: [baseCall],
    };
  }

  if (integration.provider === "retreaver") {
    return {
      provider: "retreaver",
      eventType: "webhook.test",
      source: "retreaver-test",
      call: baseCall,
    };
  }

  return {
    provider: "custom",
    eventType: "webhook.test",
    calls: [baseCall],
  };
}

function createSignedHeaderValue(
  authConfig: NonNullable<ReturnType<typeof getWebhookAuthConfig>>,
  rawBody: string
) {
  if (authConfig.type === "shared-secret") {
    return authConfig.prefix ? `${authConfig.prefix}${authConfig.secret}` : authConfig.secret;
  }

  return `${authConfig.prefix}${createHmacSha256Hex(authConfig.secret, rawBody)}`;
}

export function buildIntegrationTestEvent(
  integration: IntegrationContext,
  authConfig: NonNullable<ReturnType<typeof getWebhookAuthConfig>>
) {
  const payload = buildProviderPayload(integration);
  const rawBody = JSON.stringify(payload);
  const headerValue = createSignedHeaderValue(authConfig, rawBody);

  return {
    payload,
    rawBody,
    headers: {
      [authConfig.headerName]: headerValue,
    },
  };
}

export async function sendIntegrationTestEvent(client: SupabaseAny, integrationId: string) {
  const integration = await loadIntegrationContext(client, integrationId);
  if (!integration) {
    throw new Error("Integration not found.");
  }

  const authConfig = getWebhookAuthConfig(integration);
  if (!authConfig) {
    await recordIntegrationFailure(client, integration, {
      eventType: "webhook.test.rejected",
      message: "Test event rejected: no configured secret is available for webhook verification.",
      severity: "error",
      status: "degraded",
      errorType: "integration.webhook.test.rejected",
      payload: {
        reason: "missing_secret",
      },
    });

    throw new Error("A secret must be configured before a test event can be generated.");
  }

  const testEvent = buildIntegrationTestEvent(integration, authConfig);
  const verification = verifyWebhookRequest(testEvent.headers, testEvent.rawBody, authConfig);
  if (!verification.ok) {
    await recordIntegrationFailure(client, integration, {
      eventType: "webhook.test.rejected",
      message: `Test event rejected: ${verification.error}`,
      severity: "error",
      status: "degraded",
      errorType: "integration.webhook.test.rejected",
      payload: {
        reason: "verification_failed",
      },
    });

    throw new Error(verification.error ?? "Unable to generate a signed test event for this integration.");
  }

  const eventId = await recordIntegrationEvent(client, integration, {
    eventType: "webhook.test.accepted",
    message: "Test event accepted.",
    severity: "info",
    payload: {
      provider: integration.provider,
      test: true,
      eventType: asString(testEvent.payload.eventType),
      headerName: authConfig.headerName,
      authType: authConfig.type,
      samplePayload: testEvent.payload as Json,
    },
  });

  await updateIntegrationStatus(client, integration, {
    status: "connected",
    last_success_at: new Date().toISOString(),
  });

  await insertAuditLog(client, {
    organizationId: integration.organizationId,
    actorUserId: null,
    entityType: "integration",
    entityId: integration.id,
    action: "integration.webhook.test.sent",
    metadata: {
      summary: `Generated a test event for ${integration.displayName}.`,
      eventId,
      provider: integration.provider,
    },
  });

  return {
    ok: true,
    eventId,
    message: "Test event accepted.",
  };
}
