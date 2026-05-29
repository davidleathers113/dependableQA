---
title: Releasing & Database Migrations
owner: Engineering
last-reviewed: 2026-05-29
---

# Releasing & Database Migrations

> **Why this exists.** Deploys (Netlify) ship application code, but **database migrations are applied manually and are not part of the deploy pipeline**. CI (`npm run ci:verify` → `check:migrations`) only verifies that migration *files* are numerically contiguous — it never applies them to any database. Skipping the manual apply causes **migration drift**: the app ships against a schema the target DB doesn't have. This happened with `0008_call_review_workspace` (shipped in code 2026-04-13, applied to prod 2026-05-29), which silently 500'd the call-detail page in production for weeks. This checklist exists so that cannot happen quietly again.
>
> **Deliberately not automated.** We do **not** run `supabase db push` from CI/deploy. Auto-applying schema changes to production from CI is too risky without a deliberate release process. Migrations are applied by a human following the gate below.

## Production environment

- **Supabase project:** `gqvwuranduktvoqpuywq` (API `https://gqvwuranduktvoqpuywq.supabase.co`, Postgres 17, `us-west-2`).
- **App:** Netlify project `dependableqa`, `https://dependableqa.com`.
- Apply migrations via the **Supabase MCP** (`apply_migration`) or the Supabase CLI. The MCP is the path of record (the CLI `link` currently errors on a `config.toml` email-template path resolved relative to the repo root — a known gotcha; MCP is unaffected).

## Release checklist

Run these in order for every release. **Do not deploy code that depends on an unapplied migration.**

1. **Verify the build locally.** `npm run ci:verify` must be green (`check:env-example` → `check:migrations` → `test` → `build`).
2. **Check for pending migrations against the target DB.** Compare `supabase/migrations/` to the applied list:
   - MCP: `list_migrations`. CLI: `supabase migration list`.
   - The local file count must match the applied count, and the latest applied version must correspond to the highest-numbered local file. If the DB is behind, there are pending migrations to apply.
   - Optional drift sanity-check: confirm the specific objects a pending migration introduces are absent before applying (e.g. `select to_regclass('public.<new_table>')`).
3. **Apply pending migrations manually**, one file at a time, in order, to the target project:
   - MCP `apply_migration(name="<NNNN_name>", query=<exact file contents>)`, or CLI `supabase db push`.
   - Capture the tool output / command result. **If an apply fails, stop** — do not hand-edit schema ad hoc; investigate and report.
4. **Regenerate `supabase/types.ts` — only after** the schema is applied to the target project (MCP `generate_typescript_types`, or `supabase gen types`). Regenerating against a DB that is behind would drop types for unapplied migrations and break the build. Commit the regenerated types.
5. **Verify migration history after apply.** Re-run `list_migrations` and confirm the new version is recorded and the count matches `supabase/migrations/`.
6. **Verify the schema objects exist** (tables/columns/constraints/indexes/policies/triggers the migration introduced).
7. **Smoke-test the affected routes** (or run the affected queries read-only) — e.g. after a call-review migration, confirm the call-detail page loads and flag/notes endpoints have the columns/tables they need.
8. **Deploy the code** (push to `main` → Netlify build runs `ci:verify`).
9. **Record the result.** Note the migration applied + verification outcome in the current `docs/status-YYYY-MM-DD.md` or release notes.

## Rollback note

Migrations here are forward-only; there are no down-migrations. To reverse, write a new numbered migration. For additive changes (new table/column), the safe reversal is a follow-up `drop` migration applied through the same checklist — never an ad-hoc UI/SQL edit (migrations are the source of truth).
