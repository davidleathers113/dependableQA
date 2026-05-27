# ADR 0004: Migrations are the schema source of truth

- **Status:** Accepted
- **Date:** 2026-04-10

## Context

The schema is multi-tenant and security-sensitive (RLS policies, storage bucket policies, audit triggers). Editing schema directly in the Supabase dashboard makes changes invisible to code review, undeployable to other environments, and impossible to reconstruct from the repo.

## Decision

The numbered SQL files in `supabase/migrations/` are the single source of truth for the database schema. The workflow:

1. Add a new contiguously-numbered migration file (`000N_*.sql`).
2. Apply it to the target project via the Supabase CLI or MCP tooling.
3. Regenerate `supabase/types.ts` (the generated `Database` type the app is typed against).
4. Run `npm run ci:verify`.

`npm run check:migrations` enforces contiguous numbering and fails the build otherwise. Schema-only changes must never be made in the Supabase UI without a committed matching migration.

## Consequences

- Schema changes are reviewable, reproducible across environments, and versioned.
- `supabase/types.ts` must be regenerated after every schema change or the app's types drift from reality.
- A small amount of ceremony per change (file + apply + regenerate) — accepted for the safety it buys on a security-sensitive schema.
