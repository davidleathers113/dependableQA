import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";
import {
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  loadIntegrationContextByRingbaPublicIngestKey,
  parseRingbaPixelRequest,
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

export const POST: APIRoute = async () => methodNotAllowed();

export const GET: APIRoute = async (context) => {
  let parsedRequest: ReturnType<typeof parseRingbaPixelRequest>;
  try {
    parsedRequest = parseRingbaPixelRequest(new URL(context.request.url));
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Ringba pixel request is invalid.",
      },
      400
    );
  }

  const admin = getAdminSupabase();
  const integration = await loadIntegrationContextByRingbaPublicIngestKey(admin, parsedRequest.apiKey);
  if (!integration) {
    return json({ error: "Ringba integration not found." }, 404);
  }

  const minimumDurationSeconds = getRingbaMinimumDurationSeconds(integration);
  if (parsedRequest.durationSeconds < minimumDurationSeconds) {
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
