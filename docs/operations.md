---
title: Operations & Deployment
owner: Engineering
last-reviewed: 2026-05-27
---

# Operations & Deployment

## Hosting

The app deploys to **Netlify** (project `dependableqa`, production `https://dependableqa.com`) using the Astro Netlify adapter. Functions are bundled with esbuild. The backing Supabase project is `gqvwuranduktvoqpuywq` (Postgres 17, `us-west-2`).

## The release gate

The Netlify build command and the GitHub Actions CI job (`.github/workflows/ci.yml`, Node 22) both run:

```bash
npm run ci:verify
```

which is `check:env-example` → `check:migrations` → `test` → `build` (`astro check && astro build`). **Always run it before claiming work is done.** A type error or a non-contiguous migration number fails the deploy.

- `npm run check:env-example` — fails if any required key (see `scripts/check-env-example.mjs`) is absent from `.env-example`. Add new required env vars there.
- `npm run check:migrations` — fails unless `supabase/migrations` are numerically contiguous.

**At release time, run `npm run release:verify`** (= `check:clean-tree` → `ci:verify`). `check:clean-tree` fails when `git status --porcelain` is non-empty, so a deploy certifies a specific committed SHA rather than a dirty tree (QA report Blocker 2). It is deliberately *not* part of `ci:verify` (developers run that against a dirty tree constantly; a fresh CI checkout is always clean).

**Verifying which SHA is live (Blocker 3).** The build stamps its git commit into the bundle (`astro.config.ts` Vite `define`, preferring `COMMIT_REF`/`GITHUB_SHA`, falling back to `git rev-parse HEAD`). Hit `GET /api/version` → `{ "commit", "builtAt" }` after deploying and confirm `commit` equals the reviewed `HEAD`. This closes the gap where Netlify reported `commit_ref: null` and the live deploy could not be mapped to a reviewed SHA.

> ⚠️ **Migration drift warning.** `check:migrations` only verifies the migration *files* are numerically contiguous — neither Netlify nor GitHub CI **applies** migrations to any database. Schema changes are applied **manually** (Supabase CLI/MCP), decoupled from the deploy. If you merge a migration but skip the manual apply, the app code ships against a schema the target database does not have. This actually happened: `0008_call_review_workspace` shipped in code on 2026-04-13 but was not applied to production until 2026-05-29, silently 500ing the call-detail page (it queries `call_review_notes` / `call_flags.start_seconds`). **Always follow the [release checklist](releasing.md) and apply pending migrations as part of every release.**

## Scheduled functions (`netlify.toml`)

| Function | Schedule | Purpose |
|---|---|---|
| `ai-dispatch-scheduled` | `*/2 * * * *` | Drains the AI job queue (transcription + analysis) |
| `ringba-api-sync-scheduled` | `*/5 * * * *` | Polls the Ringba call-logs API |

These carry no endpoint auth by design: [Netlify scheduled functions can't be invoked via a URL](https://docs.netlify.com/build/functions/scheduled-functions/) — they only run on their schedule (Netlify POSTs a `{ next_run }` body), so they are not a public HTTP surface in production. Adding an app-level secret would risk breaking the cron (the scheduler can't send our header) for no gain. Behavior is covered by `tests/netlify/scheduled-functions.test.ts`, and the underlying `ringba-api-sync.ts` by `src/server/ringba-api-sync.test.ts`.

## Protected / webhook functions

Each verifies a shared secret (timing-safe compare via `src/server/netlify-request.ts`) or a provider signature:

| Function | Auth |
|---|---|
| `ai-dispatch` | header `x-dependableqa-ai-dispatch` ← `AI_DISPATCH_SHARED_SECRET` |
| `integration-ingest` | header `x-integration-id` + per-integration webhook auth (see [integrations](integrations.md)) |
| `stripe-webhook` | `stripe-signature` verified against `STRIPE_WEBHOOK_SECRET` |

## Session-guarded app routes (Ringba controlled import)

These are `prerender = false` Astro routes authed by the app session (`requireApiSession`), not shared secrets:

| Route | Guard | Purpose |
|---|---|---|
| `POST /api/integrations/ringba/import` | owner/admin | Run a manual Ringba full-API import. Server **clamps `maxRecords` to 2000** (`RINGBA_MANUAL_IMPORT_MAX_RECORDS`) even if the body asks for more, imports metadata/recording links only (no AI), and tracks the run in `ringba_import_batches`. |
| `POST /api/calls/analyze-selected` | owner/admin/billing/reviewer/analyst | The AI-spend gate. Queues transcription/analysis for the given call ids (org-verified, batch-capped). The **only** path that turns a Ringba import into OpenAI jobs. The role allowlist is explicit (`AI_SPEND_ROLES`, `src/lib/auth/ai-spend-roles.ts`) so a future read-only role is denied spend by default rather than inheriting it. |
| `POST /api/calls/verify-recording` | (same `AI_SPEND_ROLES`) | Readiness **preflight** — probes each call's recording (guarded HEAD → ranged GET, never a full download) and reports `ready` / `already_materialized` / `no_media` / `too_large` / `not_audio` / `expired_or_forbidden` / `unreachable` / `not_found`, so the UI can show "N ready / M expired" before spending. Org-scoped, batch-capped (`PREFLIGHT_MAX_BATCH`). |
| `POST /api/settings/integrations` `action: test-ringba-connection` | owner/admin | Fetches a 1-row Ringba sample to validate credentials; imports nothing. |

**Batch lifecycle (`ringba_import_batches`):** `running` → `completed` (no rejects) / `partial` (some rejects) / `failed` (fetch error or finalize error; `error` column populated, a `ringba.api.import_failed` integration event recorded). The cost-control invariant: an import alone creates **no** `ai_jobs` rows — those appear only after `analyze-selected`.

## Netlify env contexts

Set runtime config in the Netlify UI per context (Production / Deploy Preview). See [`docs/environment.md`](environment.md) for the full key list. As of the last audit, **Stripe secrets were missing from Netlify contexts** and `APP_URL` was absent from deploy previews — verify these before relying on billing in any deployed context.

## Runbook

**AI queue stuck / calls not transcribing**
1. Check `ai_jobs` for rows stuck in `claimed`/`processing` past their expected runtime, or `failed` rows with `last_error`.
2. Confirm `OPENAI_API_KEY` is present in the active Netlify context.
3. Manually drain with a `POST` to the `ai-dispatch` function (header `x-dependableqa-ai-dispatch`).

**Ringba calls not arriving**
1. Inspect recent `integration_events` for `pixel.rejected` / `pixel.skipped` (often the minimum-duration filter) or webhook auth failures.
2. Confirm the integration's `status` and stored credentials.

**Billing discrepancy**
1. Reconcile `wallet_ledger_entries` against Stripe events using `stripe_event_id`. Crediting is idempotent (the `apply_stripe_recharge_event` RPC dedups on `processed_stripe_events`), so duplicate deliveries apply at most once.

## Known operational risks

Tracked in [`docs/status-2026-05-29.md`](status-2026-05-29.md) (supersedes the [April snapshot](status-2026-04-13.md)). The Phase 1–4 blockers are now resolved: Stripe webhook credit idempotency (transactional RPC), atomic import-batch claiming + CSV dedupe, DB-level RLS proof for the service-role-heavy paths, and protected server auth now using verified `getUser()` instead of `getSession()`. All six remediation phases (0–6) are complete. (Phase 5 hardened the Ringba pixel ingest lookup and added scheduled-function/sync test coverage — scheduled functions are not publicly HTTP-invokable, so they need no endpoint auth. Phase 6 added an automated Playwright reviewer-workflow e2e suite: `npm run test:e2e`, CI workflow `e2e.yml`.) Remaining items are operational: enable Supabase Auth leaked-password protection (dashboard) and configure platform/WAF rate controls for the pixel endpoint.

**Migration drift** is a process risk, not a code risk: there is no automated migration apply (see the warning under [The release gate](#the-release-gate)). Follow the [release checklist](releasing.md) so committed migrations are actually applied to the target database.

> **`0016_ai_spend_metering` — applied to production (2026-05-30).** The `apply_call_processing_debit` RPC + its idempotency index are now in production migration history (verified: function present, EXECUTE = `service_role` only, index present, no new security-advisor findings). `supabase/types.ts` matches. Production DB is ready for the Phase 5 metering code. **Remaining rollout step (human-owned):** trigger the Netlify production deploy of the current `main` (auto-deploy is paused), then run the one-call Ringba end-to-end smoke (import → readiness → play → analyze → transcript → analysis → exactly one `call_processing` debit; re-run to confirm no duplicate spend). Note: deploying activates the wallet **enqueue gate**, so orgs that have a `billing_accounts` row with a low/zero balance will receive `402` on analyze — confirm balances before broad rollout.

> **`0021_calls_summary_aggregate` + `0022_wallet_holds_fk_indexes` — applied to production (2026-05-30).** Both verified in prod: `summarize_calls` is present and `SECURITY INVOKER` with EXECUTE granted to `authenticated`/`service_role` only (not `anon`/`public`), and a smoke call returns a clean zero-row result; the two `wallet_processing_holds` FK indexes exist and the unindexed-FK performance warning is cleared (the fresh indexes now show only as benign "unused index" INFO until traffic uses them). `supabase/types.ts` already includes `summarize_calls`. **`0021` is required by the committed `getCallsSummary` code** (it calls the RPC), so it was applied ahead of the deploy to avoid drift — do not ship the calls-summary code to any environment lacking `0021`.
