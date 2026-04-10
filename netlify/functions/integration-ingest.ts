import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { insertAuditLog, slugify } from "../../src/lib/app-data";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toIsoDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

async function ensureNamedEntity(
  client: ReturnType<typeof getAdminSupabase>,
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
    return String((existing.data as Record<string, unknown>).id ?? "");
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

  return String((created.data as Record<string, unknown>).id ?? "");
}

export async function handler(event: {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
}) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const payload = event.body ? JSON.parse(event.body) : {};
  const organizationId = asString(payload.organizationId || event.headers?.["x-organization-id"]);
  const integrationId = asString(payload.integrationId || event.headers?.["x-integration-id"]);
  const provider = asString(payload.provider || event.headers?.["x-provider"] || "custom");
  const calls = Array.isArray(payload.calls) ? payload.calls : [];
  const message = asString(payload.message) || `Received ${provider} webhook`;

  if (!organizationId || !integrationId) {
    return json(400, { error: "organizationId and integrationId are required" });
  }

  const admin = getAdminSupabase();

  const eventInsert = await admin
    .from("integration_events")
    .insert({
      organization_id: organizationId,
      integration_id: integrationId,
      event_type: asString(payload.eventType) || "webhook.received",
      severity: asString(payload.severity) || "info",
      message,
      payload,
    })
    .select("id")
    .single();

  if (eventInsert.error) {
    return json(500, { error: eventInsert.error.message });
  }

  let ingestedCount = 0;

  for (const callPayload of calls as Array<Record<string, unknown>>) {
    const callerNumber = asString(callPayload.callerNumber || callPayload.caller_number);
    if (!callerNumber) {
      continue;
    }

    const campaignId = await ensureNamedEntity(
      admin,
      "campaigns",
      organizationId,
      asString(callPayload.campaignName || callPayload.campaign_name)
    );
    const publisherId = await ensureNamedEntity(
      admin,
      "publishers",
      organizationId,
      asString(callPayload.publisherName || callPayload.publisher_name)
    );
    const externalCallId = asString(callPayload.externalCallId || callPayload.external_call_id);
    const startedAt = toIsoDate(asString(callPayload.startedAt || callPayload.started_at || new Date().toISOString()));
    const dedupeHash = `${provider}:${externalCallId || callerNumber}:${startedAt}`;

    const callInsert = await admin
      .from("calls")
      .upsert(
        {
          organization_id: organizationId,
          integration_id: integrationId,
          publisher_id: publisherId,
          campaign_id: campaignId,
          external_call_id: externalCallId || null,
          dedupe_hash: dedupeHash,
          caller_number: callerNumber,
          destination_number: asString(callPayload.destinationNumber || callPayload.destination_number) || null,
          started_at: startedAt,
          ended_at: asString(callPayload.endedAt || callPayload.ended_at) || null,
          duration_seconds: Number(callPayload.durationSeconds || callPayload.duration_seconds || 0),
          source_provider: provider,
          current_disposition: asString(callPayload.currentDisposition || callPayload.current_disposition) || null,
          source_status: "received",
        },
        {
          onConflict: "organization_id,dedupe_hash",
        }
      )
      .select("id")
      .single();

    if (callInsert.error || !callInsert.data) {
      continue;
    }

    const callId = String((callInsert.data as Record<string, unknown>).id ?? "");

    await admin.from("call_source_snapshots").insert({
      organization_id: organizationId,
      call_id: callId,
      source_provider: provider,
      source_kind: "webhook",
      raw_payload: callPayload,
      normalized_payload: callPayload,
    });

    const transcriptText = asString(callPayload.transcriptText || callPayload.transcript_text);
    if (transcriptText) {
      await admin.from("call_transcripts").upsert(
        {
          organization_id: organizationId,
          call_id: callId,
          transcript_text: transcriptText,
          transcript_segments: [],
        },
        {
          onConflict: "call_id",
        }
      );
    }

    ingestedCount += 1;
  }

  await admin
    .from("integrations")
    .update({
      status: "connected",
      last_success_at: new Date().toISOString(),
    })
    .eq("id", integrationId)
    .eq("organization_id", organizationId);

  await insertAuditLog(admin, {
    organizationId,
    actorUserId: null,
    entityType: "integration",
    entityId: integrationId,
    action: "integration.webhook.ingested",
    metadata: {
      summary: `Processed ${ingestedCount} calls from ${provider}.`,
      eventId: String((eventInsert.data as Record<string, unknown>).id ?? ""),
    },
  });

  return json(200, {
    ok: true,
    ingestedCount,
  });
}
