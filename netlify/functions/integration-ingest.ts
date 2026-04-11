import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import {
  getWebhookAuthConfig,
  ingestIntegrationCalls,
  loadIntegrationContext,
  parseWebhookPayload,
  recordIntegrationFailure,
  verifyWebhookRequest,
} from "../../src/server/integration-ingest";
import { getHeaderValue, parseNetlifyRequestBody } from "../../src/server/netlify-request";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: {
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const integrationId = getHeaderValue(event.headers, "x-integration-id");
  if (!integrationId) {
    return json(400, { error: "Missing x-integration-id header." });
  }

  const rawBody = parseNetlifyRequestBody(event.body, event.isBase64Encoded);
  const admin = getAdminSupabase();
  const integration = await loadIntegrationContext(admin, integrationId);
  if (!integration) {
    return json(404, { error: "Integration not found." });
  }

  const authConfig = getWebhookAuthConfig(integration);
  if (!authConfig) {
    await recordIntegrationFailure(admin, integration, {
      eventType: "webhook.rejected",
      message: `Rejected ${integration.displayName} webhook because auth is not configured.`,
      payload: {
        reason: "auth_not_configured",
      },
      errorType: "integration.webhook.rejected",
    });
    return json(503, { error: "Webhook authentication is not configured for this integration." });
  }

  const verificationResult = verifyWebhookRequest(event.headers, rawBody, authConfig);
  if (!verificationResult.ok) {
    await recordIntegrationFailure(admin, integration, {
      eventType: "webhook.rejected",
      message: `Rejected ${integration.displayName} webhook: ${verificationResult.error}`,
      payload: {
        reason: "signature_verification_failed",
      },
      errorType: "integration.webhook.rejected",
    });
    return json(401, { error: verificationResult.error });
  }

  let parsedPayload: ReturnType<typeof parseWebhookPayload>;
  try {
    parsedPayload = parseWebhookPayload(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook payload is invalid.";
    await recordIntegrationFailure(admin, integration, {
      eventType: "webhook.rejected",
      message: `Rejected ${integration.displayName} webhook: ${message}`,
      payload: {
        reason: "invalid_payload",
      },
      errorType: "integration.webhook.rejected",
    });
    return json(400, { error: message });
  }

  if (parsedPayload.payloadProvider && parsedPayload.payloadProvider !== integration.provider) {
    const message = "Webhook provider does not match the configured integration.";
    await recordIntegrationFailure(admin, integration, {
      eventType: "webhook.rejected",
      message: `Rejected ${integration.displayName} webhook: ${message}`,
      payload: {
        reason: "provider_mismatch",
        payloadProvider: parsedPayload.payloadProvider,
        integrationProvider: integration.provider,
      },
      errorType: "integration.webhook.rejected",
    });
    return json(400, { error: message });
  }

  if (parsedPayload.calls.length === 0) {
    const message = "Webhook payload did not contain any call records.";
    await recordIntegrationFailure(admin, integration, {
      eventType: "webhook.rejected",
      message: `Rejected ${integration.displayName} webhook: ${message}`,
      payload: {
        reason: "missing_calls",
      },
      errorType: "integration.webhook.rejected",
    });
    return json(400, { error: message });
  }

  try {
    const result = await ingestIntegrationCalls(admin, integration, parsedPayload.payload, parsedPayload.calls);
    return json(result.statusCode, {
      ok: result.rejectedCount === 0,
      ingestedCount: result.ingestedCount,
      rejectedCount: result.rejectedCount,
      eventId: result.eventId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to ingest webhook payload.";
    await recordIntegrationFailure(admin, integration, {
      eventType: "webhook.failed",
      message: `Failed to process ${integration.displayName} webhook: ${message}`,
      payload: {
        reason: "processing_failure",
      },
      status: "error",
      errorType: "integration.webhook.failed",
    });
    return json(500, { error: message });
  }
}
