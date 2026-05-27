---
title: Testing
owner: Engineering
last-reviewed: 2026-05-27
---

# Testing

The project uses **Vitest** in the `node` environment (`vitest.config.ts`), with mocks cleared and restored between tests. `.netlify/**` is excluded from the run.

## Commands

```bash
npm test               # vitest run (one-shot)
npm run test:watch     # vitest (watch mode)
npx vitest run src/server/ai-jobs.test.ts   # one file
npx vitest run -t "name fragment"           # one test by name
```

Tests are part of the [release gate](operations.md#the-release-gate): `npm run ci:verify` runs them before `astro check && astro build`.

## Where tests live

Two conventions coexist; follow the matching one when adding coverage:

- **Colocated** next to the unit under test — e.g. `src/server/ai-jobs.test.ts`, `src/middleware.test.ts`, `src/lib/stripe/metadata.test.ts`. Use for pure logic and server modules.
- **`tests/`** tree — `tests/api/` (route behavior), `tests/netlify/` (function handlers), `tests/workflows/` (end-to-end flows like import → AI → review). Use for cross-module and HTTP-surface behavior.

## What to test

Existing coverage targets the risk areas: auth/session resolution, Supabase config fallback, import dispatch, provider ingest + webhook auth, the AI job queue, call-review actions, Stripe webhook handling, and the Zod request schemas in `src/lib/call-review-api-schemas.ts`. New server modules and API routes should ship with tests in the same style.

> Manual browser QA has been done ad hoc in the past (against local `netlify dev`). There is no automated browser/e2e suite; treat manual passes as point-in-time checks, not regression coverage.
