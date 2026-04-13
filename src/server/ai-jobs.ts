import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../supabase/types";
import { insertAuditLog } from "../lib/app-data";
import { getOpenAiServerConfig } from "../lib/openai/server-client";
import { analyzeCall } from "./analyze-call";
import { transcribeCall } from "./transcribe-call";

type SupabaseAny = SupabaseClient<Database>;

export type AiJobType = "transcription" | "analysis";
export type AiJobRow = Database["public"]["Tables"]["ai_jobs"]["Row"];
export interface AiDispatchJobResult {
  id: string;
  organizationId: string;
  callId: string;
  jobType: string;
  status: string;
}
export interface AiDispatchRunResult {
  processed: AiDispatchJobResult[];
  recovered: AiDispatchJobResult[];
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function getAnalysisVersionKey(payload: Record<string, Json>) {
  const explicitVersionKey =
    asString(payload.analysisVersionKey) ||
    asString(payload.reanalysisKey) ||
    asString(payload.dedupeSuffix);

  if (explicitVersionKey) {
    return explicitVersionKey;
  }

  const config = getOpenAiServerConfig();
  return `${config.analysisPromptVersion}:${config.analysisSchemaVersion}`;
}

function normalizeJobPayload(jobType: AiJobType, payload: Json | undefined) {
  const normalizedPayload = asObject(payload);
  if (jobType !== "analysis") {
    return normalizedPayload;
  }

  return {
    ...normalizedPayload,
    analysisVersionKey: getAnalysisVersionKey(normalizedPayload),
  } satisfies Record<string, Json>;
}

function buildDedupeKey(callId: string, jobType: AiJobType, payload: Record<string, Json>) {
  if (jobType === "analysis") {
    return `${callId}:${jobType}:${getAnalysisVersionKey(payload)}`;
  }

  return `${callId}:${jobType}`;
}

function shouldRetryJob(error: unknown) {
  if (!error || typeof error !== "object") {
    return true;
  }

  return (error as { retryable?: unknown }).retryable !== false;
}

function getRetryDelayMs(attemptCount: number) {
  if (attemptCount <= 1) return 30_000;
  if (attemptCount === 2) return 120_000;
  return 300_000;
}

function buildJobResult(job: AiJobRow) {
  return {
    id: job.id,
    organizationId: job.organization_id,
    callId: job.call_id,
    jobType: job.job_type,
    status: job.status,
  } satisfies AiDispatchJobResult;
}

async function recordAiJobAudit(
  client: SupabaseAny,
  job: AiJobRow,
  action: string,
  summary: string,
  metadata: Json = {}
) {
  await insertAuditLog(client, {
    organizationId: job.organization_id,
    actorUserId: null,
    entityType: "call",
    entityId: job.call_id,
    action,
    metadata: {
      summary,
      jobId: job.id,
      jobType: job.job_type,
      status: job.status,
      ...asObject(metadata),
    },
  });
}

async function updateCallForQueuedJob(
  client: SupabaseAny,
  organizationId: string,
  callId: string,
  jobType: AiJobType,
  errorMessage: string | null
) {
  const now = new Date().toISOString();
  const update =
    jobType === "transcription"
      ? {
          transcription_status: "queued",
          transcription_started_at: null,
          transcription_completed_at: null,
          transcription_error: errorMessage,
          updated_at: now,
        }
      : {
          analysis_status: "queued",
          analysis_started_at: null,
          analysis_completed_at: null,
          analysis_error: errorMessage,
          updated_at: now,
        };

  const result = await client
    .from("calls")
    .update(update)
    .eq("organization_id", organizationId)
    .eq("id", callId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function updateCallForRunningJob(
  client: SupabaseAny,
  organizationId: string,
  callId: string,
  jobType: AiJobType
) {
  const now = new Date().toISOString();
  const update =
    jobType === "transcription"
      ? {
          transcription_status: "processing",
          transcription_started_at: now,
          transcription_error: null,
          updated_at: now,
        }
      : {
          analysis_status: "processing",
          analysis_started_at: now,
          analysis_error: null,
          updated_at: now,
        };

  const result = await client
    .from("calls")
    .update(update)
    .eq("organization_id", organizationId)
    .eq("id", callId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function updateCallForFailedJob(
  client: SupabaseAny,
  organizationId: string,
  callId: string,
  jobType: AiJobType,
  status: "queued" | "failed",
  errorMessage: string
) {
  const now = new Date().toISOString();
  const update =
    jobType === "transcription"
      ? {
          transcription_status: status,
          transcription_completed_at: status === "failed" ? now : null,
          transcription_error: errorMessage,
          updated_at: now,
        }
      : {
          analysis_status: status,
          analysis_completed_at: status === "failed" ? now : null,
          analysis_error: errorMessage,
          updated_at: now,
        };

  const result = await client
    .from("calls")
    .update(update)
    .eq("organization_id", organizationId)
    .eq("id", callId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function enqueueAiJob(
  client: SupabaseAny,
  options: {
    organizationId: string;
    callId: string;
    jobType: AiJobType;
    payload?: Json;
    priority?: number;
    maxAttempts?: number;
  }
) {
  const payload = normalizeJobPayload(options.jobType, options.payload);
  const dedupeKey = buildDedupeKey(options.callId, options.jobType, payload);
  const existing = await client
    .from("ai_jobs")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    const currentStatus = asString(existing.data.status);
    if (
      currentStatus === "queued" ||
      currentStatus === "claimed" ||
      currentStatus === "running" ||
      currentStatus === "retry_scheduled" ||
      currentStatus === "completed"
    ) {
      return {
        id: existing.data.id,
        status: currentStatus,
        created: false,
      };
    }

    const retryUpdate = await client
      .from("ai_jobs")
      .update({
        status: "queued",
        scheduled_at: new Date().toISOString(),
        lease_expires_at: null,
        completed_at: null,
        last_error: null,
        payload_json: payload,
        priority: options.priority ?? existing.data.priority,
      })
      .eq("id", existing.data.id)
      .eq("organization_id", options.organizationId)
      .select("*")
      .single();

    if (retryUpdate.error) {
      throw new Error(retryUpdate.error.message);
    }

    await updateCallForQueuedJob(client, options.organizationId, options.callId, options.jobType, null);

    return {
      id: retryUpdate.data.id,
      status: "queued",
      created: false,
    };
  }

  const insert = await client
    .from("ai_jobs")
    .insert({
      organization_id: options.organizationId,
      call_id: options.callId,
      job_type: options.jobType,
      status: "queued",
      priority: options.priority ?? 100,
      max_attempts: options.maxAttempts ?? 3,
      dedupe_key: dedupeKey,
      payload_json: payload,
    })
    .select("*")
    .single();

  if (insert.error) {
    throw new Error(insert.error.message);
  }

  await updateCallForQueuedJob(client, options.organizationId, options.callId, options.jobType, null);

  return {
    id: insert.data.id,
    status: "queued",
    created: true,
  };
}

export async function claimAiJobs(
  client: SupabaseAny,
  options: {
    limit?: number;
    leaseMs?: number;
    jobType?: AiJobType | null;
  } = {}
) {
  const now = new Date();
  const selectLimit = Math.max((options.limit ?? 5) * 3, 5);
  let query = client
    .from("ai_jobs")
    .select("*")
    .in("status", ["queued", "retry_scheduled"])
    .lte("scheduled_at", now.toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(selectLimit);

  if (options.jobType) {
    query = query.eq("job_type", options.jobType);
  }

  const candidates = await query;
  if (candidates.error) {
    throw new Error(candidates.error.message);
  }

  const claimed: AiJobRow[] = [];
  const leaseExpiry = new Date(now.getTime() + (options.leaseMs ?? 60_000)).toISOString();

  for (const candidate of candidates.data ?? []) {
    if (claimed.length >= (options.limit ?? 5)) {
      break;
    }

    const claim = await client
      .from("ai_jobs")
      .update({
        status: "claimed",
        lease_expires_at: leaseExpiry,
        last_error: null,
      })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
      .select("*")
      .maybeSingle();

    if (claim.error) {
      throw new Error(claim.error.message);
    }

    if (claim.data) {
      claimed.push(claim.data);
    }
  }

  return claimed;
}

export async function recoverExpiredAiJobs(
  client: SupabaseAny,
  options: {
    limit?: number;
    jobType?: AiJobType | null;
  } = {}
) {
  const now = new Date().toISOString();
  let query = client
    .from("ai_jobs")
    .select("*")
    .in("status", ["claimed", "running"])
    .lte("lease_expires_at", now)
    .order("lease_expires_at", { ascending: true })
    .limit(options.limit ?? 10);

  if (options.jobType) {
    query = query.eq("job_type", options.jobType);
  }

  const expired = await query;
  if (expired.error) {
    throw new Error(expired.error.message);
  }

  const recovered: AiJobRow[] = [];

  for (const job of expired.data ?? []) {
    const errorMessage = "AI job lease expired before completion.";
    const shouldRetry = job.attempt_count < job.max_attempts;
    const nextStatus = shouldRetry ? "retry_scheduled" : "failed";
    const update = await client
      .from("ai_jobs")
      .update({
        status: nextStatus,
        scheduled_at: now,
        lease_expires_at: null,
        completed_at: shouldRetry ? null : now,
        last_error: errorMessage,
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .select("*")
      .maybeSingle();

    if (update.error) {
      throw new Error(update.error.message);
    }

    if (!update.data) {
      continue;
    }

    if (shouldRetry) {
      await updateCallForFailedJob(
        client,
        job.organization_id,
        job.call_id,
        job.job_type as AiJobType,
        "queued",
        errorMessage
      );
      await recordAiJobAudit(
        client,
        update.data,
        "ai.job.lease_recovered",
        `Recovered an expired ${job.job_type} job and scheduled a retry.`,
        {
          previousStatus: job.status,
          attemptCount: job.attempt_count,
        }
      );
    } else {
      await updateCallForFailedJob(
        client,
        job.organization_id,
        job.call_id,
        job.job_type as AiJobType,
        "failed",
        errorMessage
      );
      await recordAiJobAudit(
        client,
        update.data,
        "ai.job.failed",
        `Marked an expired ${job.job_type} job as failed after exhausting retries.`,
        {
          previousStatus: job.status,
          attemptCount: job.attempt_count,
        }
      );
    }

    recovered.push(update.data);
  }

  return recovered;
}

async function markAiJobRunning(client: SupabaseAny, job: AiJobRow) {
  await updateCallForRunningJob(client, job.organization_id, job.call_id, job.job_type as AiJobType);

  const running = await client
    .from("ai_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      attempt_count: job.attempt_count + 1,
    })
    .eq("id", job.id)
    .eq("status", "claimed")
    .select("*")
    .single();

  if (running.error) {
    throw new Error(running.error.message);
  }

  await recordAiJobAudit(
    client,
    running.data,
    "ai.job.started",
    `Started ${running.data.job_type} processing.`,
    {
      attemptCount: running.data.attempt_count,
    }
  );

  return running.data;
}

async function completeAiJob(client: SupabaseAny, job: AiJobRow) {
  const result = await client
    .from("ai_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      last_error: null,
    })
    .eq("id", job.id)
    .select("*")
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  await recordAiJobAudit(
    client,
    result.data,
    "ai.job.completed",
    `Completed ${result.data.job_type} processing.`,
    {
      completedAt: result.data.completed_at,
    }
  );

  return result.data;
}

async function failAiJob(client: SupabaseAny, job: AiJobRow, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Unexpected AI job failure.";
  const shouldRetry = shouldRetryJob(error) && job.attempt_count < job.max_attempts;

  if (shouldRetry) {
    const scheduledAt = new Date(Date.now() + getRetryDelayMs(job.attempt_count)).toISOString();
    const retry = await client
      .from("ai_jobs")
      .update({
        status: "retry_scheduled",
        scheduled_at: scheduledAt,
        lease_expires_at: null,
        last_error: errorMessage,
      })
      .eq("id", job.id)
      .select("*")
      .single();

    if (retry.error) {
      throw new Error(retry.error.message);
    }

    await updateCallForFailedJob(client, job.organization_id, job.call_id, job.job_type as AiJobType, "queued", errorMessage);
    await recordAiJobAudit(
      client,
      retry.data,
      "ai.job.retry_scheduled",
      `Scheduled a retry for ${retry.data.job_type} processing.`,
      {
        errorMessage,
        attemptCount: job.attempt_count,
      }
    );

    return retry.data;
  }

  const failed = await client
    .from("ai_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      last_error: errorMessage,
    })
    .eq("id", job.id)
    .select("*")
    .single();

  if (failed.error) {
    throw new Error(failed.error.message);
  }

  await updateCallForFailedJob(client, job.organization_id, job.call_id, job.job_type as AiJobType, "failed", errorMessage);
  await recordAiJobAudit(
    client,
    failed.data,
    "ai.job.failed",
    `Failed ${failed.data.job_type} processing.`,
    {
      errorMessage,
      attemptCount: job.attempt_count,
    }
  );

  return failed.data;
}

export async function runAiJobs(
  client: SupabaseAny,
  options: {
    limit?: number;
    leaseMs?: number;
    jobType?: AiJobType | null;
    handlers?: {
      transcription?: typeof transcribeCall;
      analysis?: typeof analyzeCall;
    };
  } = {}
) {
  const handlers = {
    transcription: options.handlers?.transcription ?? transcribeCall,
    analysis: options.handlers?.analysis ?? analyzeCall,
  };
  const recoveredJobs = await recoverExpiredAiJobs(client, {
    limit: options.limit ? options.limit * 2 : 10,
    jobType: options.jobType,
  });
  const claimedJobs = await claimAiJobs(client, {
    limit: options.limit,
    leaseMs: options.leaseMs,
    jobType: options.jobType,
  });

  const processed: AiDispatchJobResult[] = [];

  for (const claimedJob of claimedJobs) {
    const runningJob = await markAiJobRunning(client, claimedJob);
    const payload = asObject(runningJob.payload_json);

    try {
      if (runningJob.job_type === "transcription") {
        await handlers.transcription(client, {
          organizationId: runningJob.organization_id,
          callId: runningJob.call_id,
          language: asString(payload.language),
        });
        await enqueueAiJob(client, {
          organizationId: runningJob.organization_id,
          callId: runningJob.call_id,
          jobType: "analysis",
        });
      } else {
        await handlers.analysis(client, {
          organizationId: runningJob.organization_id,
          callId: runningJob.call_id,
          preferredModel: asString(payload.preferredModel),
        });
      }

      const completedJob = await completeAiJob(client, runningJob);
      processed.push(buildJobResult(completedJob));
    } catch (error) {
      const failedJob = await failAiJob(client, runningJob, error);
      processed.push(buildJobResult(failedJob));
    }
  }

  return {
    processed,
    recovered: recoveredJobs.map((job) => buildJobResult(job)),
  } satisfies AiDispatchRunResult;
}
