# Status — Ringba controlled full API import (2026-05-29)

> Feature addendum to [`status-2026-05-29.md`](status-2026-05-29.md). Covers the controlled Ringba full-API import + AI cost-control gate shipped on 2026-05-29.

## Why

The Ringba integration could pull call logs + recording links, but **`ingestIntegrationCalls` auto-enqueued a transcription job for every call with a `recordingUrl`** (which then auto-chains to analysis). For a bulk/historical Ringba API import — accounts may hold thousands of recordings — that is unbounded OpenAI spend, queue load, and analysis the user never approved. We needed: connect → **test** → import a *bounded* set of metadata/recording links → explicitly confirm which calls get AI, with server-side caps that hold even if the UI is bypassed.

## What shipped

- **Migration `0015_ringba_import_batches`** — new table tracking each manual import (`organization_id`, `integration_id`, `requested_by`, `date_start/date_end`, `max_records`, `records_seen`, `records_imported`, `recordings_imported`, `import_behavior`, `status`, `error`, timestamps). CHECK-constrained status/behavior; RLS member-read / owner-admin-manage. Applied to the live project (`gqvwuranduktvoqpuywq`) via Supabase MCP; `supabase/types.ts` regenerated.
- **AI gate on ingest** — `ingestIntegrationCalls` gained `enqueueAiJobs?: boolean`, defaulting to **`false` for `completionEventKind: "ringba_api"`** (webhook/pixel/CSV unchanged). It now also returns `recordingCount` + `importedCallIds`. **Behavior change:** the scheduled Ringba sync no longer auto-transcribes either — recording links import without AI.
- **`runRingbaManualImport`** (`src/server/ringba-import.ts`) — Zod-validated, **hard cap `RINGBA_MANUAL_IMPORT_MAX_RECORDS = 2000`**, batch tracking, fetch-failure → `ringba.api.import_failed` event + batch `failed`. Plus `testRingbaConnection` (size-1 sample, no import).
- **`enqueueAnalysisForCalls`** (`src/server/analyze-selection.ts`) — the only AI-spend path. Org-verifies call ids, caps batch size, queues transcription (recording, no transcript) / analysis (has transcript), idempotent.
- **API routes** — `POST /api/integrations/ringba/import` (owner/admin), `POST /api/calls/analyze-selected` (member), and `test-ringba-connection` action on `/api/settings/integrations`.
- **UI** — `RingbaApiSyncPanel` gained a minimum-duration field + **Test connection**; new `RingbaImportPanel` (date range, max records, recording-only, min duration, import behavior; result card with per-call selection, **estimated cost warning**, Analyze selected / Analyze all imported).
- **Tests** — server + route + DB coverage proving the cost-control invariant (import → 0 `ai_jobs`), the 2000 cap, org-scoping, dedupe, token-never-exposed. `npm test` (244) and `npm run test:db` (50) green.

## Notes / follow-ups

- Wiring the same `analyze-selected` action into the main calls table (multi-select beyond the import result panel) is a follow-up; the endpoint already supports it.
- Duplicate-vs-new counts are approximated (`records_seen − records_imported` + rejects); precise dedupe reporting is a possible enhancement.
