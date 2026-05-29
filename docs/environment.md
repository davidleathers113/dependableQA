---
title: Environment Variables
owner: Engineering
last-reviewed: 2026-05-27
---

# Environment Variables

Single source of truth for runtime configuration. `.env-example` documents the contract with placeholder values; `npm run check:env-example` enforces that every **required** key below appears there. Real values live in `.env` locally (gitignored) and in the Netlify UI per context. Never commit real secrets or live project refs.

## Supabase

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes¹ | Project URL |
| `SUPABASE_ANON_KEY` | yes | Browser/server (RLS-enforced) client key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server/worker only — **bypasses RLS** |
| `SUPABASE_DATABASE_URL` | no | Netlify Supabase-integration fallback for `SUPABASE_URL` |
| `SUPABASE_JWT_SECRET` | no | Present in deployed contexts |

¹ `SUPABASE_URL` or `SUPABASE_DATABASE_URL` must resolve (see `src/lib/supabase/config.ts`).

## OpenAI / AI pipeline

| Var | Required | Default |
|---|---|---|
| `OPENAI_API_KEY` | yes | — |
| `OPENAI_WEBHOOK_SECRET` | no | — |
| `OPENAI_TRANSCRIPTION_MODEL` | no | `gpt-4o-transcribe-diarize` |
| `OPENAI_ANALYSIS_MODEL` | no | `gpt-4.1-mini` |
| `OPENAI_ANALYSIS_FALLBACK_MODEL` | no | `gpt-4.1` |
| `OPENAI_ANALYSIS_PROMPT_VERSION` | no | `v1` |
| `OPENAI_ANALYSIS_SCHEMA_VERSION` | no | `v1` |

Bump the prompt/schema versions to force re-analysis (see [ai-pipeline](ai-pipeline.md#analysis-versioning)).

## Worker / ingest secrets

| Var | Required | Notes |
|---|---|---|
| `AI_DISPATCH_SHARED_SECRET` | yes | `ai-dispatch` header secret |
| `AI_DISPATCH_BATCH_LIMIT` | no | Default batch size (5) |
| `IMPORT_DISPATCH_SHARED_SECRET` | no | `import-dispatch` header secret; falls back to `AI_DISPATCH_SHARED_SECRET` when unset (not in `check-env-example.mjs`) |
| `INTEGRATION_INGEST_SHARED_SECRET` | yes | Default integration webhook secret |
| `INTEGRATION_INGEST_SIGNATURE_HEADER` | no | Default `x-dependableqa-signature` |
| `INTEGRATION_INGEST_SIGNATURE_PREFIX` | no | Default `sha256=` |

## Stripe / billing

| Var | Required | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | Billing routes + webhook |
| `STRIPE_WEBHOOK_SECRET` | yes | `stripe-webhook` signature verification |
| `DEFAULT_RECHARGE_THRESHOLD_CENTS` | yes | Default 2000 |
| `DEFAULT_RECHARGE_AMOUNT_CENTS` | yes | Default 5000 |
| `DEFAULT_PER_MINUTE_RATE_CENTS` | yes | Default 2 |

## App / misc

| Var | Required | Notes |
|---|---|---|
| `APP_URL` | yes | Public app origin (local: `http://localhost:4321`) |
| `NETLIFY_SITE_URL` | yes | Netlify site URL |
| `APP_ENCRYPTION_KEY` | no | Reserved for at-rest encryption of stored secrets |

> The "Required" column reflects `scripts/check-env-example.mjs` (which checks the key is *documented*, not that it has a value). The app itself throws at runtime when a key it actually needs is missing — e.g. Supabase config or `OPENAI_API_KEY`.
