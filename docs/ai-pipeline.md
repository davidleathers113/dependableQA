---
title: AI Pipeline
owner: Engineering
last-reviewed: 2026-05-27
---

# AI Pipeline

Calls are transcribed and analyzed asynchronously through a database-backed job queue. Nothing runs inline in a request handler — the queue is drained by a scheduled Netlify function.

## Components

| Piece | File |
|---|---|
| Queue table | `ai_jobs` (migration `0007_ai_pipeline.sql`) |
| Queue logic | `src/server/ai-jobs.ts` |
| Transcription | `src/server/transcribe-call.ts` |
| Analysis | `src/server/analyze-call.ts` |
| OpenAI client + config | `src/lib/openai/server-client.ts` |
| Scheduled worker | `netlify/functions/ai-dispatch-scheduled.ts` (every 2 min) |
| Manual worker | `netlify/functions/ai-dispatch.ts` (shared-secret protected) |

Job types: **`transcription`** then **`analysis`**. The `calls` table carries `transcription_status` and `analysis_status` columns (`pending` → `queued` → `processing` → `completed`/`failed`) that mirror the job lifecycle. Note the two tables use **different** vocabularies for the active state: the `calls` columns use `processing`, while the `ai_jobs` queue uses `running` (see migration `0007_ai_pipeline.sql`).

## Queue lifecycle (`src/server/ai-jobs.ts`)

- **`enqueueAiJob`** — computes a `dedupe_key` from `callId` + `jobType` + normalized payload. If a job with that key already exists and is in a reusable state (`queued`/`claimed`/`running`/`retry_scheduled`/**`completed`**), it is reused — note a `completed` analysis at the same version key is deliberately **not** re-run (bump the analysis version to force re-analysis); only a `failed`/`cancelled` (terminal) job is re-queued. New jobs default to `max_attempts: 3`.
- **`claimAiJobs`** — selects `queued`/`retry_scheduled` rows and marks them `claimed`, over-fetching (`limit × 3`) then claiming up to `limit`.
- **`runAiJobs(admin, { limit, jobType })`** — the entry point the workers call. Claims, runs, and records each job; updates the call's status columns at queued/running/failed transitions; writes an audit-log entry per job via `insertAuditLog`.
- **Retries** — on failure, `shouldRetryJob` retries unless the error is explicitly marked `retryable: false`; `getRetryDelayMs(attemptCount)` applies a backoff and the job goes to `retry_scheduled` until `max_attempts` is exhausted, then `failed`.

## Analysis versioning

Analysis jobs carry an `analysisVersionKey` derived from `OPENAI_ANALYSIS_PROMPT_VERSION:OPENAI_ANALYSIS_SCHEMA_VERSION` (or an explicit `analysisVersionKey`/`reanalysisKey`/`dedupeSuffix` in the payload). This is folded into the dedupe key so that **bumping the prompt or schema version produces a distinct key and re-analysis is not suppressed** by the dedupe guard. Bump these env values when you change the analysis prompt or output schema.

## Models & config (`src/lib/openai/server-client.ts`)

Read from env, with defaults:

| Setting | Env var | Default |
|---|---|---|
| Transcription model | `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-transcribe-diarize` |
| Analysis model | `OPENAI_ANALYSIS_MODEL` | `gpt-4.1-mini` |
| Analysis fallback | `OPENAI_ANALYSIS_FALLBACK_MODEL` | `gpt-4.1` |
| Prompt version | `OPENAI_ANALYSIS_PROMPT_VERSION` | `v1` |
| Schema version | `OPENAI_ANALYSIS_SCHEMA_VERSION` | `v1` |

The OpenAI client is created lazily and cached. `OPENAI_API_KEY` is required; `OPENAI_WEBHOOK_SECRET` is optional.

## Transcription

`transcribe-call.ts` loads the recording (max 25 MB), sends it to OpenAI, and stores a diarized transcript (segments with speaker/text/start/end). Recording-source resolution guards against SSRF-style fetches (`node:net` IP checks).

## Analysis

`analyze-call.ts` runs the analysis model and returns **structured output validated by a Zod schema** via `zodTextFormat`. The schema constrains disposition, call outcome, compliance status, and flag categories/severities to fixed enum sets (mirrored in `src/lib/call-review-api-schemas.ts`). Output drives `call_analyses`, `call_flags`, and the rolled-up `calls.current_disposition`.
