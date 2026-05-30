---
title: Integrations & Ingestion
owner: Engineering
last-reviewed: 2026-05-27
---

# Integrations & Ingestion

Calls enter the system through four `source_kind`s: `csv`, `webhook`, `pixel`, and `api`. Providers are modeled by the `integration_provider` enum (`ringba`, `retreaver`, `trackdrive`, `custom`); Ringba is the most fully built-out. Per-integration settings live in `integrations.config` and are normalized through `src/lib/integration-config.ts`.

## Ingest paths

| Path | Entry point | Auth |
|---|---|---|
| CSV import | `/api/imports/dispatch` → `src/server/import-dispatch.ts` (`dispatchImportBatch`, called directly) | App session (org derived from session) |
| Webhook | `netlify/functions/integration-ingest.ts` → `src/server/integration-ingest.ts` | `x-integration-id` header + per-integration webhook auth |
| Ringba pixel | `GET /api/integrations/ringba/pixel` | Query-string `api_key` (public ingest key) |
| Ringba API sync (scheduled) | `netlify/functions/ringba-api-sync-scheduled.ts` (every 5 min) → `src/server/ringba-api-sync.ts` | Server-side, stored access token |
| Ringba full API import (manual) | `POST /api/integrations/ringba/import` → `src/server/ringba-import.ts` (`runRingbaManualImport`) | App session, owner/admin only |

The webhook, pixel, and API-sync paths funnel into the shared ingestion logic in `src/server/integration-ingest.ts`, which normalizes calls, stores the source payload, records an `integration_events` row, and updates `integrations.status`. **CSV import is the exception:** it has its own normalization/insert logic in `src/server/import-dispatch.ts` and does not pass through `integration-ingest.ts`.

### AI cost control on ingest

`ingestIntegrationCalls` accepts `enqueueAiJobs?: boolean`. The default is derived from the completion kind: `webhook` (and CSV, pixel) **auto-enqueue** transcription/analysis as before, but `completionEventKind: "ringba_api"` defaults to **`false` — metadata/recording-link import only, no AI jobs**. This is deliberate: a historical Ringba account can hold thousands of recordings, and auto-transcribing every one is unbounded OpenAI spend the user never approved. Both the **manual import** and the **scheduled API sync** therefore import recording links without transcribing. Transcription/analysis is queued only through the explicit gate `POST /api/calls/analyze-selected` (`src/server/analyze-selection.ts`), which a caller can pass `enqueueAiJobs: true` to override per-call if ever needed.

> A standalone `netlify/functions/import-dispatch.ts` (shared-secret authed, accepting a body-supplied `organizationId` under the service-role client) previously existed as an unused second entry point. It was **removed** on 2026-05-29 (Phase 1) because it violated the no-body-org tenant rule and had no caller — the API route above is the only dispatch path. The `IMPORT_DISPATCH_SHARED_SECRET` env var was retired with it.

## Webhook auth (`integration-ingest.ts`)

`verifyWebhookRequest` supports two schemes, configured per integration via `integrations.config.webhookAuth`:

- **`shared-secret`** — constant-time comparison of a header value against the stored secret.
- **`hmac-sha256`** — HMAC of the raw body, compared against a signature header. Header name and prefix are configurable, defaulting to `INTEGRATION_INGEST_SIGNATURE_HEADER` (`x-dependableqa-signature`) and prefix `sha256=`.

Auth config resolution falls back across `webhookAuth.*`, legacy `sharedSecret`/`signatureHeader`/`signaturePrefix` keys, and the env defaults, so older integration records keep working.

## Ringba pixel (`/api/integrations/ringba/pixel`)

A `GET` endpoint (POST returns 405). It:

1. Reads the `api_key` query param and resolves the integration via `loadIntegrationContextByRingbaPublicIngestKey` — an **indexed equality on the SHA-256 hash** of the key (`integrations.public_ingest_key_hash`, a generated column from migration `0014`), so the lookup is O(1) and does no plaintext per-tenant comparison.
2. Parses Ringba query params (call id, duration, campaign/publisher names, caller number, recording URL, timestamps in several formats).
3. Enforces a **minimum call duration** (`integrations.config.minimumDurationSeconds`, default 30s) — shorter calls are recorded as a `pixel.skipped` event and dropped.
4. Records `pixel.rejected` / `pixel.skipped` / accepted events in `integration_events`.

> **Note:** the key is matched by an indexed hash (migration `0014`), but it is still carried in the URL (inherent to an image pixel), which is easier to leak via logs/referrers than a header. Treat it as a rotatable secret; prefer header-based auth for new providers. App-level rate-limiting is intentionally deferred to the platform WAF.

## Ringba API sync

`ringba-api-sync.ts` (helped by `ringba-calllogs.ts`) polls the Ringba call-logs report API on a schedule. `shouldRunRingbaApiScheduledSync` gates each run by the configured poll interval (`RINGBA_API_POLL_INTERVAL_*`, default 60 min) and lookback window (`RINGBA_API_LOOKBACK_*`, default 48 h). It fetches paginated call-log rows, maps them to normalized calls, filters for recordings, and writes `last sync` state back into the integration config via `mergeRingbaApiLastSyncAt`. Pagination is bounded (`RINGBA_CALLLOG_MAX_PAGES`, `RINGBA_MAX_RECORDING_CALLS_PER_SYNC`) to keep each run within function limits. As of the cost-control change above, the scheduled sync imports recording links **without** auto-transcribing.

## Ringba full API import (controlled)

`src/server/ringba-import.ts` (`runRingbaManualImport`) is the user-driven historical backfill. The settings UI (`RingbaImportPanel`) collects a date range, max records, recording-only vs. all calls, minimum duration, and an `importBehavior` (`import_only` / `review` / `analyze`). The flow:

1. **Test connection** first (`action: "test-ringba-connection"` on `/api/settings/integrations` → `testRingbaConnection`) fetches a `size:1` sample over a 24 h window — no import, no event.
2. **Import** (`POST /api/integrations/ringba/import`, owner/admin) validates input with Zod, **clamps `maxRecords` to the hard cap `RINGBA_MANUAL_IMPORT_MAX_RECORDS` (2000)** regardless of what the body asks for, creates a `ringba_import_batches` row (`status='running'`), paginates Ringba (bounded by `RINGBA_MANUAL_IMPORT_MAX_PAGES`), ingests with `enqueueAiJobs: false`, and finalizes the batch with `records_seen` / `records_imported` / `recordings_imported` / `status`. A fetch failure records a `ringba.api.import_failed` integration event and marks the batch `failed`.
3. **Analyze gate** (`POST /api/calls/analyze-selected`, `enqueueAnalysisForCalls`) is the only path that queues AI. It verifies every call id belongs to the caller's org (others are skipped `not_in_org`), enforces a max batch size, queues **transcription** for calls with a recording and no transcript and **analysis** for calls that already have a completed transcript, and is idempotent (dedupe-safe `enqueueAiJob`). The UI shows an estimated-cost warning before queueing.

The Ringba API access token lives in `integrations.config.ringba.apiAccessToken` and is **never** returned to the browser — public config exposes only `apiTokenConfigured: boolean` (`getPublicIntegrationRingbaConfig`).

## Adding a provider

1. Extend the `integration_provider` enum (new migration) if needed.
2. Add normalization + config handling in `src/lib/integration-config.ts` and `src/server/integration-ingest.ts`.
3. Prefer header-based or HMAC auth over query-string keys.
4. Validate all inbound fields with Zod / string methods — never regex ([ADR 0003](decisions/0003-no-regex-zod-only-policy.md)).
