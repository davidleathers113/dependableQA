# DependableQA

DependableQA is a multi-tenant **call-QA operations system**. It ingests call records (CSV upload, Ringba webhook/pixel, or scheduled Ringba API sync), transcribes and AI-analyzes them with OpenAI, and gives reviewers a workspace to listen, follow a synchronized transcript, flag exact moments, and disposition calls — with a full audit trail behind every decision.

Built on **Astro 5 (SSR) + React 19 islands + Supabase (Postgres 17) + Tailwind v4 + Netlify functions**, with Stripe for billing.

> Status: in active development. See the latest [readiness snapshot](docs/status-2026-04-13.md) for known blockers before relying on this in production.

## Quickstart

```bash
npm install
cp .env-example .env     # then fill in real values (see docs/environment.md)
netlify dev --target-port 4321
```

`netlify dev` serves the app on `http://localhost:8888` **with function emulation** (AI dispatch, webhooks, Stripe, ingest). `npm run dev` runs Astro alone on `:4321` — fine for UI work, but background functions won't run. Full setup: [docs/getting-started.md](docs/getting-started.md).

## Release gate

Run before every commit and deploy — it's the same command Netlify and CI use:

```bash
npm run ci:verify   # check:env-example → check:migrations → test → build
```

| Command | Action |
|---|---|
| `npm run dev` | Astro dev server on `:4321` (no functions) |
| `netlify dev --target-port 4321` | Full local app on `:8888` with functions |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run build` | `astro check && astro build` |
| `npm run ci:verify` | Full release gate |

## Documentation

Full docs live in [`docs/`](docs/README.md):

- [Getting Started](docs/getting-started.md) · [Architecture](docs/architecture.md) · [Data Model](docs/data-model.md)
- [AI Pipeline](docs/ai-pipeline.md) · [Integrations](docs/integrations.md) · [Operations](docs/operations.md)
- [Environment Variables](docs/environment.md) · [Testing](docs/testing.md)
- [Architecture Decision Records](docs/decisions/) · [Product PRD & Spec](docs/product/)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md) · [`CHANGELOG.md`](CHANGELOG.md)

Project guidance for Claude Code is in [`CLAUDE.md`](CLAUDE.md).

## Hard rules

- **No regex anywhere** — use Zod and string methods ([ADR 0003](docs/decisions/0003-no-regex-zod-only-policy.md)).
- **Migrations are the schema source of truth** — never edit schema in the Supabase UI without a committed migration ([ADR 0004](docs/decisions/0004-migrations-as-source-of-truth.md)).
- **The service-role client bypasses RLS** — always scope queries by `organization_id` in those paths ([ADR 0002](docs/decisions/0002-three-supabase-clients-and-tenant-isolation.md)).

## License

See [LICENSE](LICENSE).
