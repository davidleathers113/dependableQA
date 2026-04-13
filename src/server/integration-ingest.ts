import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, TablesInsert } from "../../supabase/types";
import { insertAuditLog, slugify, type IntegrationProvider } from "../lib/app-data";
import { getPublicIntegrationRingbaConfig } from "../lib/integration-config";
import { enqueueAiJob } from "./ai-jobs";
import { createHmacSha256Hex, getHeaderValue, safeEqualText } from "./netlify-request";

type SupabaseAny = SupabaseClient<Database>;

export interface IntegrationContext {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  displayName: string;
  config: Json;
}

export interface WebhookAuthConfig {
  type: "shared-secret" | "hmac-sha256";
  secret: string;
  headerName: string;
  prefix: string;
}

interface IntegrationFailureOptions {
  eventType: string;
  message: string;
  payload?: Json;
  severity?: string;
  status?: Database["public"]["Enums"]["integration_status"];
  errorType: string;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asProvider(value: unknown): IntegrationProvider | null {
  const normalized = asString(value);
  if (
    normalized === "ringba" ||
    normalized === "retreaver" ||
    normalized === "trackdrive" ||
    normalized === "custom"
  ) {
    return normalized;
  }

  return null;
}

function toIsoDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function getPayloadCalls(payload: Record<string, unknown>) {
  const calls = payload.calls;
  if (Array.isArray(calls)) {
    return calls.filter((entry) => asRecord(entry)) as Array<Record<string, unknown>>;
  }

  const callRecord = asRecord(payload.call);
  if (callRecord) {
    return [callRecord];
  }

  if (asString(payload.callerNumber || payload.caller_number)) {
    return [payload];
  }

  return [];
}

function toIntegrationRecord(row: Record<string, unknown> | null): IntegrationContext | null {
  if (!row) {
    return null;
  }

  const provider = asProvider(row.provider);
  const id = asString(row.id);
  const organizationId = asString(row.organization_id);
  if (!provider || !id || !organizationId) {
    return null;
  }

  return {
    id,
    organizationId,
    provider,
    displayName: asString(row.display_name) || "Integration",
    config: (row.config ?? {}) as Json,
  };
}

function resolveWebhookAuthConfig(config: Json): WebhookAuthConfig | null {
  const configRecord = asRecord(config) ?? {};
  const webhookAuth = asRecord(configRecord.webhookAuth);

  const integrationSecret =
    asString(webhookAuth?.secret) ||
    asString(configRecord.signingSecret) ||
    asString(configRecord.sharedSecret);
  const defaultSecret = asString(process.env.INTEGRATION_INGEST_SHARED_SECRET);
  const secret = integrationSecret || defaultSecret;

  if (!secret) {
    return null;
  }

  const configuredType =
    asString(webhookAuth?.type) ||
    (asString(configRecord.sharedSecret) ? "shared-secret" : "hmac-sha256");
  const type = configuredType === "shared-secret" ? "shared-secret" : "hmac-sha256";

  const defaultHeaderName =
    asString(process.env.INTEGRATION_INGEST_SIGNATURE_HEADER) || "x-dependableqa-signature";
  const headerName =
    asString(webhookAuth?.headerName) ||
    asString(configRecord.signatureHeader) ||
    asString(configRecord.sharedSecretHeader) ||
    defaultHeaderName;
  const defaultPrefix =
    asString(process.env.INTEGRATION_INGEST_SIGNATURE_PREFIX) ||
    (type === "hmac-sha256" ? "sha256=" : "");
  const prefix = asString(webhookAuth?.prefix) || asString(configRecord.signaturePrefix) || defaultPrefix;

  return {
    type,
    secret,
    headerName,
    prefix,
  };
}

export function verifyWebhookRequest(
  headers: Record<string, string | undefined> | undefined,
  rawBody: string,
  authConfig: WebhookAuthConfig
) {
  const providedValue = getHeaderValue(headers, authConfig.headerName);
  if (!providedValue) {
    return {
      ok: false,
      error: `Missing ${authConfig.headerName} header.`,
    };
  }

  if (authConfig.type === "shared-secret") {
    const expectedValue = authConfig.prefix ? `${authConfig.prefix}${authConfig.secret}` : authConfig.secret;
    return safeEqualText(providedValue, expectedValue)
      ? { ok: true }
      : { ok: false, error: "Webhook shared secret did not match." };
  }

  const expectedSignature = `${authConfig.prefix}${createHmacSha256Hex(authConfig.secret, rawBody)}`;
  return safeEqualText(providedValue, expectedSignature)
    ? { ok: true }
    : { ok: false, error: "Webhook signature did not match." };
}

async function ensureNamedEntity(
  client: SupabaseAny,
  table: "publishers" | "campaigns",
  organizationId: string,
  name: string
) {
  if (!name.trim()) {
    return null;
  }

  const normalizedName = slugify(name);
  const existing = await client
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (existing.data) {
    return asString((existing.data as Record<string, unknown>).id);
  }

  const created = await client
    .from(table)
    .insert({
      organization_id: organizationId,
      name,
      normalized_name: normalizedName,
      external_refs: {},
    })
    .select("id")
    .single();

  if (created.error) {
    throw new Error(created.error.message);
  }

  return asString((created.data as Record<string, unknown>).id);
}

export async function loadIntegrationContext(client: SupabaseAny, integrationId: string) {
  const result = await client
    .from("integrations")
    .select("id, organization_id, provider, display_name, config")
    .eq("id", integrationId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return toIntegrationRecord((result.data ?? null) as Record<string, unknown> | null);
}

export async function loadIntegrationContextByRingbaPublicIngestKey(client: SupabaseAny, publicIngestKey: string) {
  const result = await client
    .from("integrations")
    .select("id, organization_id, provider, display_name, config")
    .eq("provider", "ringba");

  if (result.error) {
    throw new Error(result.error.message);
  }

  for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
    const integration = toIntegrationRecord(row);
    if (!integration) {
      continue;
    }

    if (getPublicIntegrationRingbaConfig(integration.config).publicIngestKey === publicIngestKey) {
      return integration;
    }
  }

  return null;
}

function requireQueryValue(searchParams: URLSearchParams, key: string) {
  const value = asString(searchParams.get(key));
  if (!value) {
    throw new Error(`${key} query parameter is required.`);
  }

  return value;
}

function parseNonNegativeInteger(value: string, key: string) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }

  return Math.floor(parsedValue);
}

function requireIsoDateValue(searchParams: URLSearchParams, key: string) {
  const value = requireQueryValue(searchParams, key);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${key} must be a valid date/time value.`);
  }

  return parsed.toISOString();
}

export function getRingbaMinimumDurationSeconds(integration: IntegrationContext) {
  return getPublicIntegrationRingbaConfig(integration.config).minimumDurationSeconds;
}

export function parseRingbaPixelRequest(requestUrl: URL) {
  const apiKey = requireQueryValue(requestUrl.searchParams, "api_key");
  const platform = requireQueryValue(requestUrl.searchParams, "platform");
  if (platform !== "ringba") {
    throw new Error("platform must be ringba.");
  }

  const durationSeconds = parseNonNegativeInteger(
    requireQueryValue(requestUrl.searchParams, "duration_seconds"),
    "duration_seconds"
  );

  const normalizedCall: Record<string, unknown> = {
    externalCallId: requireQueryValue(requestUrl.searchParams, "call_id"),
    callerNumber: requireQueryValue(requestUrl.searchParams, "caller_number"),
    durationSeconds,
    recordingUrl: requireQueryValue(requestUrl.searchParams, "recording_url"),
    campaignName: requireQueryValue(requestUrl.searchParams, "campaign_name"),
    startedAt: requireIsoDateValue(requestUrl.searchParams, "call_timestamp"),
  };

  const publisherName = asString(requestUrl.searchParams.get("publisher_name"));
  if (publisherName) {
    normalizedCall.publisherName = publisherName;
  }

  const buyerName = asString(requestUrl.searchParams.get("buyer_name"));
  if (buyerName) {
    // Preserve buyer attribution in the normalized snapshot payload until it is promoted
    // into first-class reporting/storage fields.
    normalizedCall.buyerName = buyerName;
  }

  const payload: Record<string, unknown> = {
    provider: "ringba",
    platform: "ringba",
    ingestionMode: "pixel",
    calls: [normalizedCall],
  };

  return {
    apiKey,
    payload,
    calls: [normalizedCall],
    durationSeconds,
  };
}

export function parseWebhookPayload(rawBody: string) {
  if (!rawBody.trim()) {
    throw new Error("Webhook request body is required.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("Webhook body must be valid JSON.");
  }

  const payload = asRecord(parsed);
  if (!payload) {
    throw new Error("Webhook body must be a JSON object.");
  }

  const payloadProvider = payload.provider == null ? null : asProvider(payload.provider);
  if (payload.provider != null && !payloadProvider) {
    throw new Error("Webhook provider is not supported.");
  }

  return {
    payload,
    payloadProvider,
    calls: getPayloadCalls(payload),
  };
}

export function getWebhookAuthConfig(integration: IntegrationContext) {
  return resolveWebhookAuthConfig(integration.config);
}

export async function recordIntegrationEvent(
  client: SupabaseAny,
  integration: IntegrationContext,
  options: {
    eventType: string;
    message: string;
    payload?: Json;
    severity?: string;
  }
) {
  const insert = await client
    .from("integration_events")
    .insert({
      organization_id: integration.organizationId,
      integration_id: integration.id,
      event_type: options.eventType,
      severity: options.severity ?? "info",
      message: options.message,
      payload: options.payload ?? {},
    })
    .select("id")
    .single();

  if (insert.error) {
    throw new Error(insert.error.message);
  }

  return asString((insert.data as Record<string, unknown>).id);
}

export async function updateIntegrationStatus(
  client: SupabaseAny,
  integration: IntegrationContext,
  update: Database["public"]["Tables"]["integrations"]["Update"]
) {
  const result = await client
    .from("integrations")
    .update(update)
    .eq("id", integration.id)
    .eq("organization_id", integration.organizationId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function recordIntegrationFailure(
  client: SupabaseAny,
  integration: IntegrationContext,
  options: IntegrationFailureOptions
) {
  const eventId = await recordIntegrationEvent(client, integration, {
    eventType: options.eventType,
    message: options.message,
    payload: options.payload,
    severity: options.severity ?? "error",
  });

  await updateIntegrationStatus(client, integration, {
    last_error_at: new Date().toISOString(),
    status: options.status ?? "degraded",
  });

  await insertAuditLog(client, {
    organizationId: integration.organizationId,
    actorUserId: null,
    entityType: "integration",
    entityId: integration.id,
    action: options.errorType,
    metadata: {
      summary: options.message,
      eventId,
    },
  });

  return eventId;
}

export async function ingestIntegrationCalls(
  client: SupabaseAny,
  integration: IntegrationContext,
  payload: Record<string, unknown>,
  calls: Array<Record<string, unknown>>
) {
  const processingErrors: Array<{ index: number; error: string }> = [];
  let ingestedCount = 0;

  for (let index = 0; index < calls.length; index += 1) {
    const callPayload = calls[index];
    const callerNumber = asString(callPayload.callerNumber || callPayload.caller_number);
    if (!callerNumber) {
      processingErrors.push({
        index,
        error: "Call payload is missing callerNumber.",
      });
      continue;
    }

    try {
      const campaignId = await ensureNamedEntity(
        client,
        "campaigns",
        integration.organizationId,
        asString(callPayload.campaignName || callPayload.campaign_name)
      );
      const publisherId = await ensureNamedEntity(
        client,
        "publishers",
        integration.organizationId,
        asString(callPayload.publisherName || callPayload.publisher_name)
      );
      const externalCallId = asString(callPayload.externalCallId || callPayload.external_call_id);
      const startedAt = toIsoDate(
        asString(callPayload.startedAt || callPayload.started_at || new Date().toISOString())
      );
      const recordingUrl = asString(callPayload.recordingUrl || callPayload.recording_url);
      const transcriptText = asString(callPayload.transcriptText || callPayload.transcript_text);
      const language = asString(callPayload.language || callPayload.transcript_language || callPayload.audio_language);
      const dedupeHash = `${integration.provider}:${externalCallId || callerNumber}:${startedAt}`;

      const callValues: TablesInsert<"calls"> = {
        organization_id: integration.organizationId,
        integration_id: integration.id,
        publisher_id: publisherId,
        campaign_id: campaignId,
        external_call_id: externalCallId || null,
        dedupe_hash: dedupeHash,
        caller_number: callerNumber,
        destination_number: asString(callPayload.destinationNumber || callPayload.destination_number) || null,
        started_at: startedAt,
        ended_at: asString(callPayload.endedAt || callPayload.ended_at) || null,
        duration_seconds: Number(callPayload.durationSeconds || callPayload.duration_seconds || 0),
        source_provider: integration.provider,
        current_disposition:
          asString(callPayload.currentDisposition || callPayload.current_disposition) || null,
      };

      if (recordingUrl) {
        callValues.recording_url = recordingUrl;
      }

      const callInsert = await client
        .from("calls")
        .upsert(callValues, {
          onConflict: "organization_id,dedupe_hash",
        })
        .select("id")
        .single();

      if (callInsert.error || !callInsert.data) {
        throw new Error(callInsert.error?.message ?? "Unable to write call record.");
      }

      const callId = asString((callInsert.data as Record<string, unknown>).id);
      const snapshotValues: TablesInsert<"call_source_snapshots"> = {
        organization_id: integration.organizationId,
        call_id: callId,
        source_provider: integration.provider,
        source_kind: payload.ingestionMode === "pixel" ? "pixel" : "webhook",
        raw_payload: callPayload as Json,
        normalized_payload: callPayload as Json,
      };

      const snapshotInsert = await client.from("call_source_snapshots").insert(snapshotValues);
      if (snapshotInsert.error) {
        throw new Error(snapshotInsert.error.message);
      }

      if (transcriptText) {
        const transcriptInsert = await client.from("call_transcripts").upsert(
          {
            organization_id: integration.organizationId,
            call_id: callId,
            transcript_text: transcriptText,
            transcript_segments: [],
            transcription_version: "integration",
          },
          {
            onConflict: "call_id",
          }
        );

        if (transcriptInsert.error) {
          throw new Error(transcriptInsert.error.message);
        }

        const callUpdate = await client
          .from("calls")
          .update({
            transcription_status: "completed",
            transcription_error: null,
          })
          .eq("organization_id", integration.organizationId)
          .eq("id", callId);

        if (callUpdate.error) {
          throw new Error(callUpdate.error.message);
        }

        await enqueueAiJob(client, {
          organizationId: integration.organizationId,
          callId,
          jobType: "analysis",
        });
      } else if (recordingUrl) {
        await enqueueAiJob(client, {
          organizationId: integration.organizationId,
          callId,
          jobType: "transcription",
          payload: language ? { language } : {},
        });
      } else {
        const missingSourceUpdate = await client
          .from("calls")
          .update({
            source_status: "missing_media",
          })
          .eq("organization_id", integration.organizationId)
          .eq("id", callId);

        if (missingSourceUpdate.error) {
          throw new Error(missingSourceUpdate.error.message);
        }
      }

      ingestedCount += 1;
    } catch (error) {
      processingErrors.push({
        index,
        error: error instanceof Error ? error.message : "Unexpected ingest error.",
      });
    }
  }

  const eventType =
    processingErrors.length > 0
      ? ingestedCount > 0
        ? "webhook.partial"
        : "webhook.failed"
      : "webhook.processed";
  const message =
    processingErrors.length > 0
      ? `Processed ${ingestedCount} calls for ${integration.displayName} with ${processingErrors.length} rejected payloads.`
      : `Processed ${ingestedCount} calls for ${integration.displayName}.`;
  const severity = processingErrors.length > 0 ? (ingestedCount > 0 ? "warning" : "error") : "info";
  const eventId = await recordIntegrationEvent(client, integration, {
    eventType,
    message,
    severity,
    payload: {
      eventType: asString(payload.eventType) || "webhook.received",
      callsReceived: calls.length,
      callsIngested: ingestedCount,
      errors: processingErrors,
    },
  });

  const integrationUpdate: Database["public"]["Tables"]["integrations"]["Update"] = {
    status: processingErrors.length > 0 ? (ingestedCount > 0 ? "degraded" : "error") : "connected",
  };
  if (ingestedCount > 0) {
    integrationUpdate.last_success_at = new Date().toISOString();
  }
  if (processingErrors.length > 0) {
    integrationUpdate.last_error_at = new Date().toISOString();
  }

  await updateIntegrationStatus(client, integration, integrationUpdate);

  await insertAuditLog(client, {
    organizationId: integration.organizationId,
    actorUserId: null,
    entityType: "integration",
    entityId: integration.id,
    action: "integration.webhook.ingested",
    metadata: {
      summary: message,
      eventId,
      ingestedCount,
      rejectedCount: processingErrors.length,
    },
  });

  return {
    ingestedCount,
    rejectedCount: processingErrors.length,
    eventId,
    statusCode: processingErrors.length > 0 && ingestedCount === 0 ? 422 : 200,
  };
}
