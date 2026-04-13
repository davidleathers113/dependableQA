import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";
import {
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  loadIntegrationContextByRingbaPublicIngestKey,
  parseRingbaPixelRequest,
  recordIntegrationEvent,
  recordIntegrationFailure,
} from "../../../../server/integration-ingest";

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function methodNotAllowed() {
  return json({ error: "Method not allowed" }, 405);
}

function getQueryValue(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildRejectedRingbaPixelPayload(requestUrl: URL, message: string) {
  const searchParams = requestUrl.searchParams;

  return {
    reason: "invalid_query",
    parseError: message,
    requestQuery: {
      platform: getQueryValue(searchParams, "platform"),
      call_id: getQueryValue(searchParams, "call_id"),
      duration_seconds: getQueryValue(searchParams, "duration_seconds"),
      campaign_name: getQueryValue(searchParams, "campaign_name"),
      call_timestamp: getQueryValue(searchParams, "call_timestamp"),
      publisher_name: getQueryValue(searchParams, "publisher_name"),
      buyer_name: getQueryValue(searchParams, "buyer_name"),
      caller_number_present: Boolean(getQueryValue(searchParams, "caller_number")),
      recording_url_present: Boolean(getQueryValue(searchParams, "recording_url")),
    },
  };
}

export const POST: APIRoute = async () => methodNotAllowed();

export const GET: APIRoute = async (context) => {
  const requestUrl = new URL(context.request.url);
  const candidateApiKey = getQueryValue(requestUrl.searchParams, "api_key");
  let admin: ReturnType<typeof getAdminSupabase> | null = null;
  let parsedRequest: ReturnType<typeof parseRingbaPixelRequest>;
  try {
    parsedRequest = parseRingbaPixelRequest(requestUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ringba pixel request is invalid.";
    if (candidateApiKey) {
      try {
        admin = getAdminSupabase();
        const integration = await loadIntegrationContextByRingbaPublicIngestKey(admin, candidateApiKey);
        if (integration) {
          await recordIntegrationEvent(admin, integration, {
            eventType: "pixel.rejected",
            message: `Rejected ${integration.displayName} Ringba pixel: ${message}`,
            severity: "warning",
            payload: buildRejectedRingbaPixelPayload(requestUrl, message),
          });
        }
      } catch {
        // Ignore diagnostics failures so callers still receive the underlying parse error.
      }
    }

    return json(
      {
        error: message,
      },
      400
    );
  }

  admin ??= getAdminSupabase();
  const integration = await loadIntegrationContextByRingbaPublicIngestKey(admin, parsedRequest.apiKey);
  if (!integration) {
    return json({ error: "Ringba integration not found." }, 404);
  }

  const minimumDurationSeconds = getRingbaMinimumDurationSeconds(integration);
  if (parsedRequest.durationSeconds < minimumDurationSeconds) {
    await recordIntegrationEvent(admin, integration, {
      eventType: "pixel.skipped",
      message: `Skipped ${integration.displayName} Ringba pixel because the call was below the minimum duration threshold.`,
      severity: "info",
      payload: {
        reason: "below_minimum_duration",
        minimumDurationSeconds,
        receivedDurationSeconds: parsedRequest.durationSeconds,
      },
    });
    return json({
      ok: true,
      skipped: true,
      reason: "below_minimum_duration",
      minimumDurationSeconds,
      receivedDurationSeconds: parsedRequest.durationSeconds,
    });
  }

  try {
    const result = await ingestIntegrationCalls(admin, integration, parsedRequest.payload, parsedRequest.calls);
    return json(
      {
        ok: result.rejectedCount === 0,
        skipped: false,
        ingestedCount: result.ingestedCount,
        rejectedCount: result.rejectedCount,
        eventId: result.eventId,
      },
      result.statusCode
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to ingest Ringba pixel request.";
    await recordIntegrationFailure(admin, integration, {
      eventType: "pixel.failed",
      message: `Failed to process ${integration.displayName} Ringba pixel: ${message}`,
      payload: {
        reason: "processing_failure",
      },
      status: "error",
      errorType: "integration.pixel.failed",
    });
    return json({ error: message }, 500);
  }
};
