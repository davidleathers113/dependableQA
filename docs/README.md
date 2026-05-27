---
title: Documentation Index
owner: Engineering
last-reviewed: 2026-05-27
---

# DependableQA Documentation

DependableQA is a multi-tenant call-QA operations system: ingest calls, transcribe and AI-analyze them, and let reviewers flag, annotate, and disposition them with a full audit trail. Start with the [root README](../README.md) for the product summary and quickstart.

## Start here

- [Getting Started](getting-started.md) — local dev setup
- [Architecture](architecture.md) — system overview, the three data layers, the three Supabase clients
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — workflow and the hard rules
- [`SECURITY.md`](../SECURITY.md) — secrets, tenant isolation, PII

## Reference

- [Data Model](data-model.md) — schema, RLS, migration workflow
- [AI Pipeline](ai-pipeline.md) — transcription/analysis job queue
- [Integrations & Ingestion](integrations.md) — Ringba pixel/webhook/API sync
- [Operations & Deployment](operations.md) — Netlify, the `ci:verify` gate, scheduled functions, runbook
- [Environment Variables](environment.md) — full env-var contract
- [Testing](testing.md) — Vitest conventions
- [Supabase Auth Email Templates](../supabase/templates/README.md) — branded auth emails

## Decisions (ADRs)

- [0001 — Astro SSR with React islands](decisions/0001-astro-ssr-with-react-islands.md)
- [0002 — Three Supabase clients and tenant isolation](decisions/0002-three-supabase-clients-and-tenant-isolation.md)
- [0003 — No regex; Zod for validation](decisions/0003-no-regex-zod-only-policy.md)
- [0004 — Migrations as schema source of truth](decisions/0004-migrations-as-source-of-truth.md)

## Product

- [PRD — Call Review Workspace](product/prd.md)
- [Feature Spec — Call Review Workspace](product/call-review-spec.md)

## Status

- [Readiness snapshot (2026-04-13)](status-2026-04-13.md) — point-in-time assessment with open risks

## Conventions

Every doc carries front matter with `owner` and `last-reviewed`. Point-in-time reports put the date in the filename. Use relative links between docs. Examples must never contain real secrets or live project refs. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#documentation) for the full conventions.
