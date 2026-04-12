import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../supabase/types";
import { analyzeCall } from "./analyze-call";
import { transcribeCall } from "./transcribe-call";

type SupabaseAny = SupabaseClient<Database>;

export type AiJobType = "transcription" | "analysis";
export type AiJobRow = Database["public"]["Tables"]["ai_jobs"]["Row"];

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function buildDedupeKey(callId: string, jobType: AiJobType) {
  return `${callId}:${jobType}`;
}

function getRetryDelayMs(attemptCount: number) {
  if (attemptCount <= 1) return 30_000;
  if (attemptCount === 2) return 120_000;
  return 300_000;
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
  const dedupeKey = buildDedupeKey(options.callId, options.jobType);
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
        payload_json: options.payload ?? {},
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
      payload_json: options.payload ?? {},
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

  return result.data;
}

async function failAiJob(client: SupabaseAny, job: AiJobRow, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Unexpected AI job failure.";
  const shouldRetry = job.attempt_count < job.max_attempts;

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
  const claimedJobs = await claimAiJobs(client, {
    limit: options.limit,
    leaseMs: options.leaseMs,
    jobType: options.jobType,
  });

  const processed: Array<{ id: string; jobType: string; status: string }> = [];

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
      processed.push({
        id: completedJob.id,
        jobType: completedJob.job_type,
        status: completedJob.status,
      });
    } catch (error) {
      const failedJob = await failAiJob(client, runningJob, error);
      processed.push({
        id: failedJob.id,
        jobType: failedJob.job_type,
        status: failedJob.status,
      });
    }
  }

  return processed;
}
