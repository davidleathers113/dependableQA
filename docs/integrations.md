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
| Ringba API sync | `netlify/functions/ringba-api-sync-scheduled.ts` (every 5 min) → `src/server/ringba-api-sync.ts` | Server-side, stored access token |

The webhook, pixel, and API-sync paths funnel into the shared ingestion logic in `src/server/integration-ingest.ts`, which normalizes calls, stores the source payload, records an `integration_events` row, and updates `integrations.status`. **CSV import is the exception:** it has its own normalization/insert logic in `src/server/import-dispatch.ts` and does not pass through `integration-ingest.ts`.

> A standalone `netlify/functions/import-dispatch.ts` (shared-secret authed, accepting a body-supplied `organizationId` under the service-role client) previously existed as an unused second entry point. It was **removed** on 2026-05-29 (Phase 1) because it violated the no-body-org tenant rule and had no caller — the API route above is the only dispatch path. The `IMPORT_DISPATCH_SHARED_SECRET` env var was retired with it.

## Webhook auth (`integration-ingest.ts`)

`verifyWebhookRequest` supports two schemes, configured per integration via `integrations.config.webhookAuth`:

- **`shared-secret`** — constant-time comparison of a header value against the stored secret.
- **`hmac-sha256`** — HMAC of the raw body, compared against a signature header. Header name and prefix are configurable, defaulting to `INTEGRATION_INGEST_SIGNATURE_HEADER` (`x-dependableqa-signature`) and prefix `sha256=`.

Auth config resolution falls back across `webhookAuth.*`, legacy `sharedSecret`/`signatureHeader`/`signaturePrefix` keys, and the env defaults, so older integration records keep working.

## Ringba pixel (`/api/integrations/ringba/pixel`)

A `GET` endpoint (POST returns 405). It:

1. Reads the `api_key` query param and resolves the integration via `loadIntegrationContextByRingbaPublicIngestKey`.
2. Parses Ringba query params (call id, duration, campaign/publisher names, caller number, recording URL, timestamps in several formats).
3. Enforces a **minimum call duration** (`integrations.config.minimumDurationSeconds`, default 30s) — shorter calls are recorded as a `pixel.skipped` event and dropped.
4. Records `pixel.rejected` / `pixel.skipped` / accepted events in `integration_events`.

> **Note:** the pixel uses a query-string `api_key`, which is easier to leak via logs/referrers than a header. This is a tracked risk in [`docs/status-2026-04-13.md`](status-2026-04-13.md); prefer header-based auth for new providers.

## Ringba API sync

`ringba-api-sync.ts` (helped by `ringba-calllogs.ts`) polls the Ringba call-logs report API on a schedule. `shouldRunRingbaApiScheduledSync` gates each run by the configured poll interval (`RINGBA_API_POLL_INTERVAL_*`, default 60 min) and lookback window (`RINGBA_API_LOOKBACK_*`, default 48 h). It fetches paginated call-log rows, maps them to normalized calls, filters for recordings, and writes `last sync` state back into the integration config via `mergeRingbaApiLastSyncAt`. Pagination is bounded (`RINGBA_CALLLOG_MAX_PAGES`, `RINGBA_MAX_RECORDING_CALLS_PER_SYNC`) to keep each run within function limits.

## Adding a provider

1. Extend the `integration_provider` enum (new migration) if needed.
2. Add normalization + config handling in `src/lib/integration-config.ts` and `src/server/integration-ingest.ts`.
3. Prefer header-based or HMAC auth over query-string keys.
4. Validate all inbound fields with Zod / string methods — never regex ([ADR 0003](decisions/0003-no-regex-zod-only-policy.md)).
