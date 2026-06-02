import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";
import {
  getWebhookAuthConfig,
  ingestIntegrationCalls,
  verifyWebhookRequest,
  type IntegrationContext,
} from "./integration-ingest";
import { normalizeRetreaverWebhookCall, type RetreaverWebhookPayload } from "./retreaver-webhook";

type SupabaseAny = SupabaseClient<Database>;

export type RetreaverWebhookAuthResult = { ok: true } | { ok: false; error: string };

/**
 * Provider-specific wrapper over the shared `verifyWebhookRequest` (shared-secret /
 * HMAC, timing-safe). It resolves the integration's webhook auth config and adds a
 * Retreaver label to the failure message — no cryptographic code is duplicated.
 * Returns failure (never throws) when no signing secret is configured, so an
 * unverified Retreaver webhook can't be accepted by a future route. Error messages
 * never include the secret or signature value.
 */
export function verifyRetreaverWebhookRequest(
  integration: IntegrationContext,
  headers: Record<string, string | undefined> | undefined,
  rawBody: string
): RetreaverWebhookAuthResult {
  const authConfig = getWebhookAuthConfig(integration);
  if (!authConfig) {
    return { ok: false, error: "Retreaver webhook verification is not configured (no signing secret)." };
  }

  const result = verifyWebhookRequest(headers, rawBody, authConfig);
  if (result.ok) {
    return { ok: true };
  }
  return { ok: false, error: `Retreaver webhook auth failed: ${result.error ?? "verification failed."}` };
}

/**
 * Retreaver webhook → ingest adapter. Bridges the pure `normalizeRetreaverWebhookCall`
 * to the app's `ingestIntegrationCalls` contract. Server-only and isolated — no live
 * webhook route imports it yet. Ingest is metadata-only (`enqueueAiJobs: false`), so a
 * Retreaver call never triggers hidden AI spend. Credentials are never logged/returned.
 */

export interface RetreaverIngestPayload {
  /** Synthetic source-payload metadata recorded by ingest (no raw secrets). */
  payload: Record<string, unknown>;
  /** Normalized calls, shaped for ingestIntegrationCalls. */
  calls: Array<Record<string, unknown>>;
  /** Payload entries skipped before ingest because caller/start time could not be normalized. */
  invalidPayloadCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRetreaverPayloadEntries(payload: RetreaverWebhookPayload): RetreaverWebhookPayload[] {
  if (payload instanceof URLSearchParams) {
    return [payload];
  }

  const calls = payload.calls;
  if (Array.isArray(calls)) {
    return calls.filter((entry): entry is Record<string, unknown> => Boolean(asRecord(entry)));
  }

  const call = asRecord(payload.call);
  if (call) {
    return [call];
  }

  return [payload];
}

/**
 * Pure: normalize a Retreaver webhook payload and wrap it with consistent ingest
 * metadata, or return null when the payload can't be normalized (missing caller /
 * unparseable time). No DB access — easy to unit-test.
 */
export function buildRetreaverIngestPayload(payload: RetreaverWebhookPayload): RetreaverIngestPayload | null {
  const entries = getRetreaverPayloadEntries(payload);
  const calls: Array<Record<string, unknown>> = [];

  for (const entry of entries) {
    const normalized = normalizeRetreaverWebhookCall(entry);
    if (normalized) {
      calls.push(normalized as unknown as Record<string, unknown>);
    }
  }

  if (calls.length === 0) {
    return null;
  }

  const isBatch = entries.length > 1;
  return {
    payload: {
      provider: "retreaver",
      platform: "retreaver",
      ingestionMode: "webhook",
      eventType: isBatch ? "retreaver.webhook.batch" : "retreaver.webhook.call",
      callsReceived: entries.length,
      callsNormalized: calls.length,
    },
    calls,
    invalidPayloadCount: entries.length - calls.length,
  };
}

export type RetreaverWebhookIngestResult =
  | { status: "ignored"; reason: "invalid_payload" }
  | {
      status: "ingested";
      ingestedCount: number;
      rejectedCount: number;
      recordingCount: number;
      importedCallIds: string[];
      invalidPayloadCount: number;
    };

/**
 * Adapt + ingest a single Retreaver webhook payload. Invalid payloads are returned
 * as `{ status: "ignored" }` without throwing and without calling ingest. Valid ones
 * are ingested metadata-only. `ingestImpl` is injectable for testing.
 */
export async function ingestRetreaverWebhookCall(options: {
  client: SupabaseAny;
  integration: IntegrationContext;
  payload: RetreaverWebhookPayload;
  ingestImpl?: typeof ingestIntegrationCalls;
}): Promise<RetreaverWebhookIngestResult> {
  const built = buildRetreaverIngestPayload(options.payload);
  if (!built) {
    return { status: "ignored", reason: "invalid_payload" };
  }

  const ingest = options.ingestImpl ?? ingestIntegrationCalls;
  // Cost control: enqueueAiJobs:false guarantees metadata-only — no transcription
  // or analysis is queued even when the call carries a recording URL.
  const result = await ingest(options.client, options.integration, built.payload, built.calls, {
    enqueueAiJobs: false,
  });

  return {
    status: "ingested",
    ingestedCount: result.ingestedCount,
    rejectedCount: result.rejectedCount + built.invalidPayloadCount,
    recordingCount: result.recordingCount,
    importedCallIds: result.importedCallIds,
    invalidPayloadCount: built.invalidPayloadCount,
  };
}
