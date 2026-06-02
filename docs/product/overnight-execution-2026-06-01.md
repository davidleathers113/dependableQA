# Overnight Execution Brief: Ship-Ready DependableQA

Date: 2026-06-01
Owner: David Leathers
Supervisor: Jachin / OpenClaw

## Objective

Move DependableQA toward a limited-launch, usable SaaS for pay-per-call agencies that need to import calls from Ringba, Retreaver, TrackDrive, and CallGrid, transcribe/analyze recordings, and let human QA reviewers flag exact call moments with notes and final review decisions.

The current app is stable and has a green `npm run ci:verify` gate. The priority is not a rewrite. Tighten the product flows and close the highest-value gaps using the existing Astro + React + Supabase + Stripe architecture.

## User Experience Standard

The app must feel obvious to a PPCall operator or agency user:

- First-run setup should clearly answer: what do I connect, what key/URL do I need, what happens next?
- Import flows should clearly separate metadata import from paid AI analysis.
- The call list should lead naturally into review queues.
- The call detail page should behave like a QA workspace, not a generic audio player.
- Human QA agents should be able to listen, jump, flag a specific moment/range, add notes, resolve flags, and submit final review outcomes without wondering where to go.
- Billing should make the wallet/upcharged-credit model understandable: add balance, estimate spend, gate paid analysis, show ledger/runway.

## Critical Boundaries

- Do not commit, push, deploy, install software, change production settings, or modify production databases.
- Do not store or print secrets from `.env`.
- Preserve the project rules in `AGENTS.md` and `CLAUDE.md`.
- No regex anywhere. Use Zod, URL, and string methods.
- Migrations are the schema source of truth.
- Any service-role path must scope by `organization_id`.
- Every meaningful behavior change needs focused Vitest/API/e2e coverage.
- Keep `npm run ci:verify` green before claiming a task is done.

## Current Verified Baseline

`npm run ci:verify` passed on 2026-06-01:

- env example check: pass
- migration ordering: 22 files, pass
- Vitest: 58 files / 385 tests pass
- Astro check/build: pass

Existing non-fatal typecheck hints/warnings include an unused `previousFraudRate` in `src/lib/app-data.ts` and Zod deprecation warnings around `.finite()` / `.flatten()`.

## Product Workstream

Start by reading:

- `docs/product/prd.md`
- `docs/product/call-review-spec.md`
- `docs/integrations.md`
- `docs/data-model.md`
- `src/features/call-review/**`
- `src/features/calls/**`
- `src/features/imports/**`
- `src/features/integrations/**`
- `src/features/billing/**`

Then produce or update a concrete product-flow map in `docs/product/` covering:

1. First account/org setup.
2. Add funds / wallet / auto-recharge.
3. Connect provider.
4. Import calls.
5. Select calls for AI analysis.
6. Review queue triage.
7. Human QA review workspace.
8. Final review/disposition.
9. Manager follow-up on flags.
10. Onboarding another agency user/team member.

After the flow map, implement the smallest high-impact improvements revealed by the map. Prefer real UI fixes and missing states over broad redesign.

## Integration Workstream

Ringba is already the most complete provider. Retreaver and TrackDrive currently have guided setup UI but need deeper API-backed ingestion. CallGrid appears in the business requirement, but public docs found so far do not expose a clean call-log/recording API reference.

Use official/current docs before implementing provider-specific API behavior.

Reference findings to verify:

- TrackDrive calls API: `GET https://[subdomain].trackdrive.com/api/v1/calls`, Basic auth, cursor pagination, `recording_url` field, supported JSON/CSV.
  Source: https://trackdrive.com/api/docs/1.0/calls/index.html
- Retreaver: official docs recommend webhooks for real-time updates; Core API is REST/paginated and supports JSON.
  Source: https://retreaver.github.io/core-api-docs/
  Webhooks guide: https://learn.retreaver.com/guides/webhooks
- CallGrid: public site confirms API access and RTB docs; bid API is documented at `https://bid.callgrid.com/api/bid/{Grid-ID}` but this is not the same as historical call import/recording sync.
  Source: https://callgrid.com/knowledge-base/bid-api

Recommended sequence:

1. Generalize provider config types only as much as needed.
2. Add TrackDrive API config, connection test, bounded manual import, and tests.
3. Add Retreaver webhook normalization first, then API pull only if docs are clear enough.
4. Add CallGrid placeholder/config with clear "needs API docs/account credentials" UX unless verified docs exist.
5. Keep import default metadata-only where bulk AI spend could surprise the user.
6. Reuse the existing `ingestIntegrationCalls` pipeline where possible.

## Overnight Loop

1. Inspect current state and choose one scoped task.
2. Implement.
3. Run focused tests.
4. Run broader gate when practical.
5. Summarize changed files, validation, and remaining risk in a local note.
6. If Claude hits usage limits, record the reset time if shown, wait, then resume from the latest verified state.

## Claude Supervision Loop

Use `scripts/send-claude-and-verify.sh` for every new Claude Code prompt in the
`dependableqa-overnight` tmux session.

Rules:

- Prompts must be Level 2: product context, scoped task, files/areas to inspect,
  constraints, acceptance criteria, tests, and required final report.
- A prompt is not considered sent until fresh Claude activity is verified in the pane.
- Every prompt is appended to `docs/product/overnight-prompts-2026-06-01.md`.
- Current session state is written to `docs/product/overnight-status.md`.
- Use the timestamped tmux log when answering idle-time questions.

## Execution Log

### 2026-06-01 — Flow map + first-run "Getting started" checklist

**Product flow map.** Wrote [`docs/product/flow-map.md`](flow-map.md): the as-built,
end-to-end map of all ten core flows (org setup → wallet → connect provider → import →
paid-AI gate → triage → review workspace → disposition → manager follow-up → team
onboarding), the nav spine, role gates, and a ship-readiness gap list.

**Highest-impact change implemented.** The map confirmed the #1 UX gap: a brand-new org
lands on `/app/overview` to an all-zero dashboard with **no indication of what to do next**.
Added a first-run **Getting started** checklist to Overview that sequences the remaining
setup and deep-links each step, auto-hiding once complete.

Changed/added files:

- `src/lib/app-data.ts` — new pure `deriveSetupChecklist(...)` + `SetupChecklist`/`SetupStep`
  types; `OverviewData.setup`; `getOverviewData` now derives the four step states
  (funds / source / analyze / review) from already-loaded, **org-scoped** signals
  (extended the existing `calls` select with `analysis_completed_at, current_review_status`
  — no extra query).
- `src/features/overview/GettingStartedChecklist.tsx` — purely presentational checklist
  (copy + deep links live here; renders `null` when `setup.complete`).
- `src/features/overview/OverviewPage.tsx` — renders the checklist above the KPI grid.
- Tests: `src/lib/app-data.test.ts` (+5 `deriveSetupChecklist` cases),
  `src/features/overview/GettingStartedChecklist.test.tsx` (+3 SSR render cases).

**Validation.** `npm run ci:verify` → exit 0: env-example ✓, migrations ✓ (22 files),
**vitest 59 files / 393 tests pass** (baseline was 58/385), `astro check`/build clean.
No regex; no migrations (app-layer only); no secrets; no prod/DB changes.

**Remaining risk / follow-ups** (from the gap list in `flow-map.md`):
1. No "analyze selected" affordance on the **Calls list** — paid-analysis selection still
   only lives in the Ringba import panel. Strong candidate for the next scoped task.
2. Reports page is a placeholder. 3. Integration pre-traffic health could set expectations
   more explicitly. 4. Wallet per-minute pricing is implicit at the point of spend.

### 2026-06-01 — "Analyze selected" affordance on the Calls list (gap #2)

Closed follow-up #1 above. The general Calls list now lets a user multi-select calls and
queue AI analysis without re-entering through the Ringba import panel — reusing the existing
org-scoped, role-gated, wallet-reserving `POST /api/calls/analyze-selected` endpoint
(no server/route changes).

Changed/added files:

- `src/features/calls/analyzeActions.ts` — pure helpers: per-call cost estimate label +
  `summarizeAnalyzeResult` (groups skip reasons into a readable notice).
- `src/features/calls/components/CallsTable.tsx` — optional leading checkbox column
  (select-all header + per-row, with `stopPropagation` so it doesn't open the drawer);
  colSpans updated; all new props optional (default off → no behavior change elsewhere).
- `src/features/calls/CallsPage.tsx` — `canAnalyze` prop, selection state, analyze mutation
  (invalidates the calls query on success), and an action bar ("Analyze N selected" + est.
  cost + Clear) with success/error notices; selection resets on filter/sort change.
- `src/pages/app/calls/index.astro` — computes `canAnalyze = canSpendAi(role)` server-side
  and passes it down (UI gate only; the route still re-checks the role and org-scopes ids).
- Tests: `analyzeActions.test.ts` (4) + `components/CallsTable.test.tsx` (3 SSR render cases).

**Tenant/role safety:** unchanged server contract — `/api/calls/analyze-selected` re-checks
`canSpendAi`, scopes every id by `organization_id`, drops cross-org ids as `not_in_org`,
reserves wallet funds (402 on shortfall), and caps the batch. The client gate is convenience
only.

**Validation.** Focused: `analyzeActions.test.ts` + `CallsTable.test.tsx` → 7/7.
`npm run ci:verify` → exit 0: **vitest 61 files / 400 tests pass**, `astro check` 0 errors,
build complete. No regex; no migrations; no secrets; no prod/DB changes.

**Browser validation.** `npm run test:e2e` → exit 0: **14 Playwright tests passed**
against the local Supabase e2e setup. Covered reviewer workflow and Ringba first-run
integration affordances; no production Supabase traffic.

### 2026-06-01 — Wallet/pricing transparency: "How you're billed" panel (gap #5)

The per-minute rate (`billing_accounts.per_minute_rate_cents`) is the basis of every wallet
charge but was **never shown in the UI** — it was already loaded into `BillingSummary`
(`perMinuteRateCents`) and unused. Added a plain-language pricing explainer to the Billing
page, anchored to the org's real rate, directly above the ledger so "how I'm charged" sits
next to the debits it produces. Pure UI/derivation change — no server, route, schema, or
data-fetch changes.

Changed/added files:

- `src/features/billing/pricing.ts` — pure, client-safe mirror of the server metering rules
  (`billableMinutes`, `estimateCallCostCents`, `describePricing`); intentionally duplicates
  the tiny formula from server-only `src/server/ai-pricing.ts` (which must not be imported
  into an island) and is unit-tested to stay in sync.
- `src/features/billing/components/PricingSummaryCard.tsx` — presentational "How you're
  billed" panel: shows the per-minute rate + a worked example when metered, an explicit
  "not metered" state when the rate is 0, and the model bullets (analysis-only, rounds up,
  1-min min, transcription-only, wallet-gated).
- `src/features/billing/BillingPage.tsx` — renders the panel above `WalletLedgerTable`,
  fed by the already-loaded `data.perMinuteRateCents`.
- Tests: `pricing.test.ts` (6 cases) + `components/PricingSummaryCard.test.tsx` (3 SSR cases).

**Tenant/role/wallet safety:** no change to any server path, RPC, or query; the panel only
renders data already scoped to the active org by `getBillingSummary`. Authoritative
metering/reservation logic in `ai-pricing.ts` is untouched.

**Validation.** Focused: `pricing.test.ts` + `PricingSummaryCard.test.tsx` → 9/9.
`npm run ci:verify` → exit 0: **vitest 63 files / 409 tests pass**, `astro check` 0 errors,
build complete. No regex; no migrations; no secrets; no prod/DB changes.

**Remaining pricing follow-up:** the in-context analyze cost estimate (Calls list +
Ringba panel) still uses a flat ~$0.03/call rather than the real rate × call duration. A
future scoped task could compute it from `perMinuteRateCents` × `billableMinutes(duration)`
to match what actually settles.

### 2026-06-01 — CSV import is metadata-only by default (billing-safety, gap #6)

**User problem.** CSV upload — the fastest first-run "get calls in" path — silently
auto-enqueued paid AI (transcription for any row with a recording URL, analysis for any row
with a transcript) for **every** accepted row, with no wallet gate, reservation, estimate,
or user awareness (`import-dispatch.ts`). It was the lone ingest path bypassing the
otherwise-disciplined "import metadata → explicitly, gated analyze" model, and a textbook
surprise-spend risk for a new customer uploading thousands of calls.

**Fix.** CSV import is now metadata-only by default; queuing AI on import is an explicit,
wallet-aware opt-in. No schema change (the choice is request-scoped).

Changed/added files:

- `src/server/import-dispatch.ts` — `dispatchImportBatch` gains `enqueueAiJobs?` (default
  `true`, preserving the function's existing unit contract + the auto-enqueue workflow test);
  the two `enqueueAiJob` calls are gated on it; the choice is recorded in the audit log
  (`metadata.aiEnqueued`).
- `src/pages/api/imports/dispatch.ts` — reads `analyzeOnImport` (only literal `true` opts in;
  anything else stays safe) and passes `enqueueAiJobs`, so the real product path defaults to
  metadata-only.
- `src/features/imports/api.ts` — `dispatchImportBatchRequest(batchId, analyzeOnImport=false)`.
- `src/features/imports/ImportsPage.tsx` — holds the opt-in state and threads it through the
  upload mutation only; **retries/re-dispatch stay metadata-only** (safe).
- `src/features/imports/components/NewImportCard.tsx` — opt-in checkbox above the dropzone,
  off by default, with concise wallet-impact copy ("imports stay metadata-only… spends wallet
  funds… analyze later from the Calls list").

**Tenant/role/wallet/secret safety:** unchanged. Dispatch still runs under the
session-derived org (`requireApiSession`), never a body-supplied org; no AI pipeline, wallet
RPC, or `analyze-selected` reservation logic was touched; default behavior strictly *reduces*
spend. Webhook/pixel ingest and the Ringba API import are unchanged.

**Validation.** Focused: `import-dispatch.test.ts` + `tests/api/imports-dispatch.test.ts` +
`NewImportCard.test.tsx` → 17/17. `npm run ci:verify` → exit 0: **vitest 63 files / 413 tests
pass**, `astro check` 0 errors, build complete. No regex; no migrations; no secrets; no
prod/DB changes. (Browser e2e suite — 14 Playwright tests — was confirmed green at the start
of this loop; this change is covered by unit/route/component tests and doesn't alter the
reviewer e2e flow.)

**Next best gap.** The CSV AI opt-in path doesn't reserve wallet funds up front the way
`analyze-selected` does (it relies on the on-completion debit's never-negative clamp). Routing
the opt-in through the same reservation — or, more broadly, making the in-context analyze
estimate use the real `perMinuteRateCents × billableMinutes(duration)` — is the highest-value
remaining billing-transparency follow-up.

### 2026-06-01 — Transcript search e2e stabilized

Claude fixed the pre-existing Playwright failure `transcript search finds matches` as a
separate scoped task. Root cause: the test typed into the call-review React island before
hydration finished, then React reset the controlled search input back to its empty initial
value. The transcript itself was loading correctly; the e2e was racing hydration.

Changed/added files:

- `tests/e2e/reviewer-workflow.spec.ts` — retries the full type-and-assert sequence until
  the search state reflects the query and "Next hit" is enabled.
- `src/features/call-review/searchHelpers.test.ts` — focused coverage for
  `findAllMatchPositions` and `splitTextByRanges` including case-insensitive matching,
  multiple hits, no-match/empty-needle behavior, progress on overlapping-capable input, and
  range merging.

**Validation.** Focused search helper Vitest → 7/7. Focused Playwright
`transcript search finds matches` → 3/3. Full `npm run test:e2e` → 14/14. Full
`npm run ci:verify` → exit 0: **64 files / 420 tests pass**, `astro check` 0 errors, build
complete. No product source change; no regex; no migrations; no secrets; no prod/DB changes.

**Residual risk.** Low. Future e2e tests that type into freshly-loaded React islands may need
the same type-and-assert retry pattern if they hit pre-hydration input resets.

### 2026-06-01 — Wallet-accurate analyze cost estimates

Closed the remaining wallet-pricing transparency gap from the flow map. The Calls-list
"Analyze selected" bar and the Ringba import panel no longer use the flat `~$0.03/call`
placeholder. They now estimate spend from the org's actual per-minute wallet rate and the
selected/imported calls' durations: `perMinuteRateCents × billableMinutes(duration)`, rounded
up with a one-minute minimum. Zero-rate orgs show a clear not-metered message.

Changed/added files:

- `src/features/billing/pricing.ts` — added `estimateBatchCostCents` and
  `estimateBatchCostLabel`, reusing the existing client-safe billing formula.
- `src/features/billing/pricing.test.ts` — added batch-estimate coverage.
- `src/features/calls/analyzeActions.ts` / `analyzeActions.test.ts` — removed the old flat
  per-call estimate helper; kept the analyze result summary helper.
- `src/features/calls/CallsPage.tsx` and `src/pages/app/calls/index.astro` — pass the org
  per-minute rate into the calls island and compute the selected-call estimate from visible
  row durations.
- `src/features/integrations/IntegrationsPage.tsx`,
  `src/features/integrations/components/IntegrationDetailWorkspace.tsx`,
  `src/features/integrations/components/RingbaImportPanel.tsx`, and
  `src/pages/app/integrations.astro` — thread the org rate into the Ringba import panel and
  estimate selected/all-imported AI spend from imported call durations.
- `docs/product/flow-map.md` — marks wallet-pricing gap #5 addressed.

**Validation.** Focused Vitest (`pricing.test.ts` + `analyzeActions.test.ts`) → 14/14.
`npm run ci:verify` → exit 0: **64 files / 424 tests pass**, `astro check` 0 errors, build
complete. Full `npm run test:e2e` → 14/14 Playwright tests pass. No staged files; no commits;
no regex; no migrations; no secrets; no production/settings changes.

**Residual risk.** The estimate is intentionally an upper bound because Calls-list rows do not
currently expose enough status to exclude already-transcribed/no-media calls before submitting.
Server-side wallet reservation, org scoping, role checks, and debit logic remain authoritative
and unchanged.

### 2026-06-01 — Pre-traffic integration diagnostics guidance

Closed flow-map gap #4. A configured integration with no recent events now gets a practical
Diagnostics empty state instead of a thin "no recent events" message. The panel explains that
no events before first traffic can be normal, shows the next verification step the user can run
before live traffic, and lists the signals that will appear after the first call/webhook.

Changed/added files:

- `src/features/integrations/helpers.ts` — added `getIntegrationPreTrafficGuide(...)` and
  `IntegrationPreTrafficGuide`, reusing `getIntegrationNextStep(...)` for the verify-now action
  and keeping provider claims conservative.
- `src/features/integrations/components/IntegrationDiagnosticsPanel.tsx` — renders the
  pre-traffic guide for configured integrations with zero recent events; unconfigured and
  populated diagnostics states remain intact.
- `src/features/integrations/helpers.test.ts` — added Ringba, completed-setup, and generic
  webhook-provider guide coverage.
- `src/features/integrations/components/IntegrationDiagnosticsPanel.test.tsx` — new SSR render
  coverage for pre-traffic, unconfigured, and populated-event states.
- `docs/product/flow-map.md` — marks integration health gap #4 addressed.

**Validation.** Focused Vitest (`helpers.test.ts` +
`IntegrationDiagnosticsPanel.test.tsx`) → 28/28. First `npm run ci:verify` caught two
test-only type errors; Claude fixed them. Re-run `npm run ci:verify` → exit 0:
**65 files / 430 tests pass**, `astro check` 0 errors, build complete. Full e2e not run:
change is presentational/pure helper only, not covered by the existing integrations e2e tab
path, and the render path is covered by SSR tests. No staged files; no commits; no regex; no
migrations; no secrets; no production/settings changes.

**Residual risk.** Low. The verify-now callout names the destination tab but is not clickable.
A small follow-up could thread tab navigation into the diagnostics panel so the callout can
jump directly to API sync, Security, Pixel, etc.

### 2026-06-01 — Actionable pre-traffic Diagnostics callout

Closed the small follow-up above. The Diagnostics "Verify before live traffic" callout now
jumps directly to the relevant setup tab when tab navigation is available, while preserving a
static non-button rendering when the panel is used without a navigation callback. If the
integration has no remaining verify-now action, the expectations still render without a dead
control.

Changed/added files:

- `src/features/integrations/helpers.ts` — `IntegrationPreTrafficGuide.verifyNow` now includes
  `targetTab` alongside the existing label/copy.
- `src/features/integrations/components/IntegrationDiagnosticsPanel.tsx` — optional
  `onNavigate` callback renders the verify-now callout as a button and calls
  `onNavigate(verify.targetTab)`.
- `src/features/integrations/components/IntegrationDetailWorkspace.tsx` — threads
  `setActiveTab` into Diagnostics.
- `src/features/integrations/helpers.test.ts` and
  `src/features/integrations/components/IntegrationDiagnosticsPanel.test.tsx` — focused helper
  and render coverage for target tabs, button/no-button behavior, and no-verify expectations.

**Validation.** Focused Vitest (`helpers.test.ts` +
`IntegrationDiagnosticsPanel.test.tsx`) -> 31/31. `npm run ci:verify` -> exit 0:
**65 files / 433 tests pass**, `astro check` 0 errors, build complete. Full e2e not run:
the change is a presentational button wired to existing tab state and is covered by component
tests plus build type-checking. No staged files; no commits; no regex; no migrations; no
secrets; no production/settings changes.

**Next best gap.** CSV import is now metadata-only by default, but its explicit "Analyze with
AI after import" opt-in still does not reserve/check wallet funds up front like the
`analyze-selected` path. A small follow-up should either route post-import analysis through
the existing reservation gate or add equivalent upfront wallet protection.

### 2026-06-01 — CSV analyze-on-import uses wallet reservation gate

Closed the billing-safety follow-up above. CSV import remains metadata-only by default. When
the user explicitly opts into "Analyze with AI after import", dispatch now creates the metadata
first, collects newly accepted analyzable call ids, and queues them through
`enqueueAnalysisForCalls` rather than the old direct `enqueueAiJob` path. Wallet reservation,
org scoping, skip reasons, and batch caps now match the Calls list and Ringba import analyze
flows.

Changed/added files:

- `src/server/import-dispatch.ts` — added `analyzeOnImport`, `ImportAiQueueOutcome`, and
  reservation-backed post-import queueing; insufficient balance reports a blocked AI outcome
  while leaving imported metadata available.
- `src/pages/api/imports/dispatch.ts` — user-facing route always disables legacy inline
  enqueue and passes the explicit `analyzeOnImport` flag.
- `src/server/import-dispatch.test.ts` — focused coverage for metadata-only, successful
  opt-in through the gate, insufficient-balance blocked opt-in, and no-analyzable opt-in.
- `tests/api/imports-dispatch.test.ts` — route assertions updated for the new call shape.

**Validation.** Focused Vitest (`import-dispatch.test.ts`, `imports-dispatch.test.ts`, and
`import-ai-review.test.ts`) -> 18/18. `npm run ci:verify` -> exit 0:
**65 files / 436 tests pass**, `astro check` 0 errors, build complete. Full e2e not run:
change is server-side dispatch logic plus a route flag; existing e2e does not exercise CSV
dispatch, and the UI/copy is unchanged. No staged files; no commits; no regex; no migrations;
no secrets; no production/settings changes.

**Residual risk / follow-up.** The API and audit now expose the blocked AI outcome, but the
upload flow currently redirects to batch detail and the client parser drops `aiQueue`, so the
blocked state is not visible to the user yet. A small follow-up should thread `aiQueue` through
the import client and show a clear "AI not queued — add funds, then analyze from Calls" notice.

### 2026-06-01 — Import UI surfaces blocked analyze-on-import queue

Closed the residual UX gap above. When a CSV upload opts into AI but wallet reservation blocks
the paid queue, the client now preserves the `aiQueue` result through the redirect and shows a
one-shot batch-detail notice: import metadata completed, AI was not queued, add funds, then
analyze from the Calls list. Metadata-only imports, successful AI queues, retries, and unrelated
batches do not show stale notices.

Changed/added files:

- `src/features/imports/api.ts` — added a stable client `ImportAiQueueResult` shape,
  `parseAiQueue(...)`, and preserved `aiQueue` from dispatch responses.
- `src/features/imports/helpers.ts` — added actionable notice formatting plus a
  `sessionStorage` stash/take handoff keyed by batch id.
- `src/features/imports/ImportsPage.tsx` — stashes blocked AI queue notices before redirecting
  to batch detail.
- `src/features/imports/ImportBatchDetailPage.tsx` — reads and clears the one-shot notice,
  renders an amber banner with an Add funds link, and clears it on metadata-only re-dispatch.
- `src/features/imports/api.test.ts` and `src/features/imports/helpers.test.ts` — focused
  parsing and notice/handoff coverage.

**Validation.** Focused Vitest (`api.test.ts` + `helpers.test.ts`) -> 23/23.
First `npm run ci:verify` caught two type errors in the new fetch mock; Claude fixed them.
Re-run `npm run ci:verify` -> exit 0: **66 files / 447 tests pass**, `astro check` 0 errors,
build complete. Full e2e not run: the change is client response parsing, sessionStorage
handoff, and a conditional banner; existing e2e does not cover CSV upload to batch detail. No
staged files; no commits; no regex; no migrations; no server/reservation/auth/secrets or
production/settings changes.

**Residual risk.** The notice is intentionally sessionStorage-backed, so it only appears after
the upload redirect in the same browser session. Directly opening the batch URL later will not
show it, but the audit log still records the blocked outcome and the calls remain analyzable
from the Calls list.
