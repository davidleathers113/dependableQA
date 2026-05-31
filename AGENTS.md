# Repository Guidelines

## Project Structure & Module Organization

DependableQA is an Astro SSR app with React islands, Supabase, Netlify functions, and Tailwind. Routes and API handlers live in `src/pages/`; UI in `src/components/`; feature screens in `src/features/`; shared helpers in `src/lib/`; server workflows in `src/server/`. Netlify functions are in `netlify/functions/`. Supabase migrations and generated types are in `supabase/`. Tests are colocated as `*.test.ts(x)` or grouped under `tests/api/`, `tests/db/`, `tests/e2e/`, `tests/netlify/`, and `tests/workflows/`. Static assets live in `public/`; docs live in `docs/`.

## Build, Test, and Development Commands

- `npm run dev` starts Astro on `http://localhost:4321` without function emulation.
- `netlify dev --target-port 4321` starts the full local app on `http://localhost:8888` with Netlify functions.
- `npm test` runs the default Vitest suite. Single file: `npx vitest run path/to/file.test.ts`; single test: `npx vitest run -t "name fragment"`.
- `npm run test:db` runs database tests against a local Supabase stack.
- `npm run test:e2e` runs Playwright.
- `npm run build` runs `astro check` (which fails on type errors, so `build` doubles as the typecheck gate) and builds the app.
- `npm run ci:verify` runs env checks, migration checks, tests, and build.

## Coding Style & Naming Conventions

Use TypeScript, Astro, and React patterns already present nearby. Keep server-only code in `src/server/**` or API/function handlers; never import service-role clients, OpenAI, or Stripe SDKs into React islands. Validate inputs with Zod. This repo has a hard no-regex rule: avoid regex literals, `new RegExp`, and regex-based `.match`, `.test`, `.exec`, or `.replace`; use Zod, `URL`, and string methods. Use kebab-case Astro filenames and PascalCase React components. There is no separate lint step; style and types are enforced by `astro check` (run via `npm run build`).

## Testing Guidelines

Use Vitest for unit, server, API, Netlify, workflow, and component tests. Colocate simple module tests next to implementation; use `tests/` for cross-module or route-level behavior. Use Playwright for browser workflows in `tests/e2e/`. DB tests require `supabase start` and local databases. Add tests for behavior changes, auth/session logic, tenant isolation, billing, AI jobs, imports, and API routes.

## Commit & Pull Request Guidelines

Commit history uses Conventional Commit style, for example `fix(ai): restore analysis_completed_at` or `feat(integrations): add IANA time zone selection`. Keep commits descriptive and scoped. Branch from `main` and run `npm run ci:verify` before PRs. Include a summary, testing performed, linked issues when relevant, and screenshots or recordings for visible UI changes.

## Security & Configuration Tips

Never commit secrets. Use `.env` locally and mirror required variables in `.env-example` so `check:env-example` passes. Supabase migrations are the schema source of truth; add contiguous files under `supabase/migrations/` and regenerate `supabase/types.ts`. In service-role/admin paths, always filter by `organization_id` because service-role access bypasses RLS.
