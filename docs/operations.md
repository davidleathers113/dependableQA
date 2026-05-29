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

> ⚠️ **Migration drift warning.** `check:migrations` only verifies the migration *files* are numerically contiguous — neither Netlify nor GitHub CI **applies** migrations to any database. Schema changes are applied **manually** (Supabase CLI/MCP), decoupled from the deploy. If you merge a migration but skip the manual apply, the app code ships against a schema the target database does not have. This actually happened: `0008_call_review_workspace` shipped in code on 2026-04-13 but was not applied to production until 2026-05-29, silently 500ing the call-detail page (it queries `call_review_notes` / `call_flags.start_seconds`). **Always follow the [release checklist](releasing.md) and apply pending migrations as part of every release.**

## Scheduled functions (`netlify.toml`)

| Function | Schedule | Purpose |
|---|---|---|
| `ai-dispatch-scheduled` | `*/2 * * * *` | Drains the AI job queue (transcription + analysis) |
| `ringba-api-sync-scheduled` | `*/5 * * * *` | Polls the Ringba call-logs API |

## Protected / webhook functions

Each verifies a shared secret (timing-safe compare via `src/server/netlify-request.ts`) or a provider signature:

| Function | Auth |
|---|---|
| `ai-dispatch` | header `x-dependableqa-ai-dispatch` ← `AI_DISPATCH_SHARED_SECRET` |
| `integration-ingest` | header `x-integration-id` + per-integration webhook auth (see [integrations](integrations.md)) |
| `stripe-webhook` | `stripe-signature` verified against `STRIPE_WEBHOOK_SECRET` |

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
1. Reconcile `wallet_ledger_entries` against Stripe events. Note the known idempotency gap (below) — duplicate Stripe deliveries can double-credit.

## Known operational risks

Tracked in [`docs/status-2026-05-29.md`](status-2026-05-29.md) (supersedes the [April snapshot](status-2026-04-13.md)): Stripe webhook credit idempotency, non-atomic import-batch claiming (concurrent dispatch can race), service-role-heavy API routes relying on app-side tenant filtering, and `getSession()` rather than a verified-user server pattern on protected paths. Documented, not yet fixed.

**Migration drift** is a process risk, not a code risk: there is no automated migration apply (see the warning under [The release gate](#the-release-gate)). Follow the [release checklist](releasing.md) so committed migrations are actually applied to the target database.
