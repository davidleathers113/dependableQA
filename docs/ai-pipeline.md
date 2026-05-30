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
- **Leases are sized per job type** — transcription gets `TRANSCRIPTION_LEASE_MS` (20 min) vs analysis's `DEFAULT_LEASE_MS` (5 min). A transcription downloads + diarizes real call audio and can exceed 5 minutes; the longer lease stops `recoverExpiredAiJobs` from reclaiming a still-running job. An explicit `options.leaseMs` still overrides.
- **Execution is idempotent against duplicate spend** — the queue dedupe key and the `call_transcripts`/`call_analyses` upserts prevent duplicate *rows*, but a job reclaimed mid-flight would otherwise re-call OpenAI and pay twice. So `transcribeCall` returns early when a completed transcript already exists, and `analyzeCall` returns early when an analysis at the active version already exists — neither hits OpenAI on a re-run.
- **Wallet metering** — the enqueue gate (`enqueueAnalysisForCalls`) estimates the batch's transcription cost (`billing_accounts.per_minute_rate_cents` × billable minutes) and throws `InsufficientBalanceError` → the route returns **HTTP 402** when it exceeds the wallet balance. On a transcription job completing, `runAiJobs` calls `debitCallProcessing` (best-effort, idempotent per call via `apply_call_processing_debit`) to settle actual usage. See [data-model](data-model.md) "AI spend metering". Orgs with no `billing_accounts` row are neither metered nor blocked.

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

`transcribe-call.ts` loads the recording (max 25 MB), sends it to OpenAI, and stores a diarized transcript (segments with speaker/text/start/end).

Recording downloads from a URL (e.g. a Ringba `recordingUrl`, which 302-redirects to S3) go through the shared **`src/server/recording-fetch.ts`** (`fetchRecordingWithGuards`). It:

- follows redirects **manually** and re-runs the SSRF host check on **every** hop (so a `Location` header can't redirect into a private/loopback host — the pixel path accepts a caller-supplied `recording_url`), capped at 5 redirects;
- enforces the size cap from `Content-Length` **and** while streaming, so an oversized body is rejected **before** any Supabase upload and is never buffered unbounded into memory;
- resolves the audio format from **magic bytes → content-type → URL path**, and throws (never emits a bogus `.audio`) when the format is unidentifiable;
- marks `400/401/403/404/410` as **non-retryable** (a dead/expired link fails fast instead of burning the job's retry budget); `5xx`/network/timeout stay retryable;
- never logs the URL, query string, or any `Authorization` header (they can carry signed credentials), and only sends provider auth to a verified host on the first hop, never across a redirect. Ringba's public recording URLs need **no** auth — proven by `scripts/ringba-recording-smoke.mjs` (`npm run ringba:smoke-recording`).

## Recording playback (`GET /api/calls/[callId]/recording`)

The reviewer's audio player streams a short-lived Supabase signed URL of the
private storage copy (`recording_storage_path`) — never the third-party
`recording_url` directly. A Ringba/pixel import only sets `recording_url`, so the
route **lazily materializes** on first play: if there is no storage object but a
`recording_url` exists, it fetches through the shared `fetchRecordingWithGuards`,
uploads the validated audio to the `recordings` bucket, sets
`recording_storage_path`, then signs. This makes `hasRecording` honest (a Ringba
call is playable before any AI spend) and pre-warms the exact object transcription
later reuses. The materialization path **never enqueues** a transcription/analysis
job, uses a larger size ceiling than transcription (playback isn't bound by
OpenAI's 25 MB limit), and on a dead/expired source returns a clear "Recording
source unavailable or expired."

## Analysis

`analyze-call.ts` runs the analysis model and returns **structured output validated by a Zod schema** via `zodTextFormat`. The schema constrains disposition, call outcome, compliance status, and flag categories/severities to fixed enum sets (mirrored in `src/lib/call-review-api-schemas.ts`). Output drives `call_analyses`, `call_flags`, and the rolled-up `calls.current_disposition`.
