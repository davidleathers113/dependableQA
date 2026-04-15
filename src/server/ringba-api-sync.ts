import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";
import {
  getPublicIntegrationRingbaConfig,
  getRingbaApiAccessTokenFromConfig,
  mergeRingbaApiLastSyncAt,
} from "../lib/integration-config";
import {
  getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls,
  loadIntegrationContext,
  recordIntegrationEvent,
  type IntegrationContext,
} from "./integration-ingest";
import {
  buildRingbaCallLogsReportRange,
  fetchRingbaCallLogsPage,
  filterRecordingRows,
  mapRingbaCallLogRowToNormalizedCall,
  RINGBA_CALLLOG_MAX_PAGES,
  RINGBA_CALLLOG_PAGE_SIZE,
  RINGBA_MAX_RECORDING_CALLS_PER_SYNC,
  type RingbaCallLogRow,
} from "./ringba-calllogs";

type SupabaseAny = SupabaseClient<Database>;

function parseIsoMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function shouldRunRingbaApiScheduledSync(
  integrationConfig: unknown,
  nowMs: number,
  opts: { manual?: boolean }
): boolean {
  if (opts.manual) {
    return true;
  }

  const pub = getPublicIntegrationRingbaConfig(integrationConfig);
  if (!pub.ringbaApiSyncEnabled) {
    return false;
  }

  const token = getRingbaApiAccessTokenFromConfig(integrationConfig);
  if (!token || !pub.ringbaAccountId.trim()) {
    return false;
  }

  const lastMs = parseIsoMs(pub.lastRingbaApiSyncAt);
  if (lastMs == null) {
    return true;
  }

  const intervalMs = pub.pollIntervalMinutes * 60 * 1000;
  return nowMs - lastMs >= intervalMs;
}

export async function runRingbaApiSyncForIntegration(
  client: SupabaseAny,
  integration: IntegrationContext,
  opts: { manual?: boolean } = {}
): Promise<{ ok: boolean; skipped?: boolean; ingestedCount: number; error?: string }> {
  const pub = getPublicIntegrationRingbaConfig(integration.config);
  const token = getRingbaApiAccessTokenFromConfig(integration.config);

  if (!opts.manual && !pub.ringbaApiSyncEnabled) {
    return { ok: true, skipped: true, ingestedCount: 0 };
  }

  if (!token || !pub.ringbaAccountId.trim()) {
    return {
      ok: false,
      ingestedCount: 0,
      error: "Ringba API token or account id is not configured.",
    };
  }

  if (!shouldRunRingbaApiScheduledSync(integration.config, Date.now(), opts)) {
    return { ok: true, skipped: true, ingestedCount: 0 };
  }

  const minimumDurationSeconds = getRingbaMinimumDurationSeconds(integration);
  const timeZone = pub.callLogsTimeZone.trim() || "America/Chicago";
  const lookbackHours = pub.lookbackHours;
  const { reportStart, reportEnd } = buildRingbaCallLogsReportRange(lookbackHours);

  const normalizedCalls: Array<Record<string, unknown>> = [];
  let offset = 0;

  try {
    for (let page = 0; page < RINGBA_CALLLOG_MAX_PAGES; page += 1) {
      const pageResult = await fetchRingbaCallLogsPage({
        accountId: pub.ringbaAccountId.trim(),
        apiToken: token,
        reportStart,
        reportEnd,
        formatTimeZone: timeZone,
        offset,
        size: RINGBA_CALLLOG_PAGE_SIZE,
      });

      const records = (pageResult.report?.records ?? []) as RingbaCallLogRow[];
      if (records.length === 0) {
        break;
      }

      const withRecordings = filterRecordingRows(records);
      for (const row of withRecordings) {
        const mapped = mapRingbaCallLogRowToNormalizedCall(row, {
          timeZone,
          minimumDurationSeconds,
        });
        if (mapped) {
          normalizedCalls.push(mapped);
        }
        if (normalizedCalls.length >= RINGBA_MAX_RECORDING_CALLS_PER_SYNC) {
          break;
        }
      }

      if (normalizedCalls.length >= RINGBA_MAX_RECORDING_CALLS_PER_SYNC) {
        break;
      }

      if (records.length < RINGBA_CALLLOG_PAGE_SIZE) {
        break;
      }

      offset += RINGBA_CALLLOG_PAGE_SIZE;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ringba API request failed.";
    await recordIntegrationEvent(client, integration, {
      eventType: "ringba.api.sync_failed",
      message: `Ringba API sync failed for ${integration.displayName}: ${message}`,
      severity: "error",
      payload: {
        reason: "ringba_http_error",
        reportStart,
        reportEnd,
      },
    });
    return { ok: false, ingestedCount: 0, error: message };
  }

  const payload: Record<string, unknown> = {
    provider: "ringba",
    platform: "ringba",
    ingestionMode: "api",
    eventType: "ringba.api.sync",
  };

  const syncCompletedAt = new Date().toISOString();

  const result = await ingestIntegrationCalls(client, integration, payload, normalizedCalls, {
    completionEventKind: "ringba_api",
  });

  const mergedConfig = mergeRingbaApiLastSyncAt(integration.config, syncCompletedAt);
  const configUpdate = await client
    .from("integrations")
    .update({ config: mergedConfig })
    .eq("id", integration.id)
    .eq("organization_id", integration.organizationId);

  if (configUpdate.error) {
    return {
      ok: false,
      ingestedCount: result.ingestedCount,
      error: configUpdate.error.message,
    };
  }

  return { ok: true, ingestedCount: result.ingestedCount };
}

export async function runRingbaApiSyncForAllEligibleIntegrations(
  client: SupabaseAny
): Promise<{ processed: number; errors: number }> {
  const rows = await client
    .from("integrations")
    .select("id, organization_id, provider, display_name, config")
    .eq("provider", "ringba");

  if (rows.error || !rows.data) {
    throw new Error(rows.error?.message ?? "Unable to load Ringba integrations.");
  }

  let processed = 0;
  let errors = 0;

  for (const row of rows.data) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) {
      continue;
    }

    const integration = await loadIntegrationContext(client, id);
    if (!integration) {
      continue;
    }

    if (!shouldRunRingbaApiScheduledSync(integration.config, Date.now(), {})) {
      continue;
    }

    processed += 1;
    const outcome = await runRingbaApiSyncForIntegration(client, integration, {});
    if (!outcome.ok && !outcome.skipped) {
      errors += 1;
    }
  }

  return { processed, errors };
}
