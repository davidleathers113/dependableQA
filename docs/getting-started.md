---
title: Getting Started
owner: Engineering
last-reviewed: 2026-05-27
---

# Getting Started

Local development setup for DependableQA.

## Prerequisites

- Node.js 22 (matches CI)
- Netlify CLI (`npm install -g netlify-cli`) — required for function emulation
- Access to the Supabase project (or a local Supabase stack)

## 1. Install

```bash
npm install
```

## 2. Configure env

Copy `.env-example` to `.env` and fill in real values (see [`docs/environment.md`](environment.md)). At minimum you need the Supabase keys and `OPENAI_API_KEY` for the AI pipeline. `.env` is gitignored — never commit it.

## 3. Run

```bash
netlify dev --target-port 4321
```

This serves the app on `http://localhost:8888` **with Netlify function emulation** (AI dispatch, webhooks, Stripe, ingest). If your browser doesn't open automatically, visit it manually.

> `npm run dev` runs Astro alone on `:4321`. It's fine for UI work, but the Netlify functions (queue workers, webhooks) won't run — use `netlify dev` when touching anything server/background.

## 4. Database

The schema is defined by `supabase/migrations/` (see [`docs/data-model.md`](data-model.md) for the workflow). After any schema change, regenerate `supabase/types.ts`. Seed data lives in `supabase/seed.sql` / `supabase/seed.csv`.

## 5. Verify before committing

```bash
npm run ci:verify
```

Runs env/migration checks, the test suite, and the production build — the same gate Netlify and CI use.

## Where to go next

- [Architecture](architecture.md) — system overview and the three Supabase clients
- [Data model](data-model.md) — schema and migration workflow
- [AI pipeline](ai-pipeline.md) — transcription/analysis queue
- [Testing](testing.md) — how to run and write tests
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — conventions and the hard rules
