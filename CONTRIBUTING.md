# Contributing

Internal contribution guide for DependableQA. New to the codebase? Read [docs/getting-started.md](docs/getting-started.md) and [docs/architecture.md](docs/architecture.md) first.

## Workflow

1. Branch off `main` (don't commit directly to `main`).
2. Make the change; add or update tests in the matching style (see [docs/testing.md](docs/testing.md)).
3. Run the release gate: `npm run ci:verify`.
4. Open a PR. CI runs the same gate on Node 22.

Keep commits descriptive and history clean.

## Hard rules

These are non-negotiable and enforced in review:

- **No regex, anywhere.** No `new RegExp`, literal `/pattern/`, or `.match` / `.test` / `.exec` / `.replace` with a pattern. Use Zod for validation, the `URL` constructor for URLs, and string methods (`includes` / `startsWith` / `indexOf` / `substring`) for the rest. See [ADR 0003](docs/decisions/0003-no-regex-zod-only-policy.md).
- **Migrations are the schema source of truth.** Add a contiguously-numbered file in `supabase/migrations/`, apply it, regenerate `supabase/types.ts`, then run `ci:verify`. Never change schema in the Supabase UI without a committed migration. See [ADR 0004](docs/decisions/0004-migrations-as-source-of-truth.md).
- **Respect the client boundary.** Server-only code (`src/server/**`, the service-role admin client, OpenAI/Stripe SDKs) must never be imported into a React island. In admin-client paths, always filter by `organization_id`. See [ADR 0002](docs/decisions/0002-three-supabase-clients-and-tenant-isolation.md).
- **No secrets in the repo.** Config comes from env vars (see [docs/environment.md](docs/environment.md)). When you add a *required* env var, also add it to `.env-example` or `check:env-example` fails the build.
- **Run `ci:verify` before saying "done".** Tests passing + `astro check` + build is the bar.

## Conventions

- Match the existing code style and idioms in the file you're editing.
- Validate input with Zod schemas; colocate shared schemas under `src/lib/`.
- Prefer reusing helpers in `src/lib/app-data.ts`, `src/lib/integration-config.ts`, and `src/server/netlify-request.ts` over re-implementing.

## Documentation

- Docs live in [`docs/`](docs/README.md); add a link from [`docs/README.md`](docs/README.md) when you add a doc.
- Every doc carries front matter with `owner` and `last-reviewed` (ISO date). Update `last-reviewed` when you materially revise a doc.
- Point-in-time reports (status, audits) put the date in the filename and are not edited later — write a new dated file instead.
- Use **relative links** between docs so they resolve on GitHub and locally.
- Examples must never contain real secrets, tokens, or live project refs — use placeholders.
- Record significant or hard-to-reverse architectural decisions as an ADR in [`docs/decisions/`](docs/decisions/) (Context / Decision / Consequences).
- User-facing release notes go in the `updates` content collection (`src/content/updates/`) and are mirrored into [`CHANGELOG.md`](CHANGELOG.md).
