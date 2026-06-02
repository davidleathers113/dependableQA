# Overnight Batch — Review / Split Plan

Created: 2026-06-02 13:18 EDT
Corrected: 2026-06-02 16:24 EDT

Purpose: make the large dirty overnight batch reviewable by splitting it into ordered,
self-contained commits/PRs. **No product scope is added here** — this is a packaging plan
only. Working tree is intentionally dirty; `main` is ahead of `origin`; nothing is staged.

Batch size: `git diff --stat` = 35 tracked files modified (+1805 / −67); 33 untracked
new files (mostly new source + colocated tests + ops docs).

## How to use this plan

- Land groups **top to bottom** — later groups depend on shared helpers introduced earlier
  (call-outs below).
- Each group is independently green: stage the listed files, then run the "rerun" command.
- The whole batch is already green together: `npm run ci:verify` → exit 0, 75 test files /
  519 tests, astro check 0 errors, build complete (last run 2026-06-02 16:25 EDT).
- Full e2e is also green: `npm run test:e2e` → 14/14 passed (last run 2026-06-02 16:26 EDT).
- Use `git add -- <paths>` (never `-A`) so the ops-docs group stays separate from product code.

---

## Group 1 — First-run onboarding checklist

Adds the Overview "Getting started" checklist driven by a pure, unit-tested derivation in
the central data layer. Touches `app-data.ts` additively (new export + 2 extra selected
columns in `getOverviewData`), so it should land first to minimize rebase pain on the
shared file.

Files:
- `src/lib/app-data.ts` (new `deriveSetupChecklist` / `SetupChecklist` types; `getOverviewData` selects `analysis_completed_at`, `current_review_status` and returns `setup`)
- `src/lib/app-data.test.ts`
- `src/features/overview/OverviewPage.tsx`
- `src/features/overview/GettingStartedChecklist.tsx` *(new)*
- `src/features/overview/GettingStartedChecklist.test.tsx` *(new)*

Validation known: covered by the full vitest run. Rerun:
`npx vitest run src/lib/app-data.test.ts src/features/overview/GettingStartedChecklist.test.tsx`

---

## Group 2 — Billing pricing transparency + shared estimate helper

Introduces the shared `pricing.ts` estimate helper. **Foundational: `pricing.ts` is also
imported by Group 3 (Calls) and by `RingbaImportPanel`.** Land before Group 3. The Ringba
panel's estimate adoption rides here so the shared helper and all its consumers stay consistent.

Files:
- `src/features/billing/pricing.ts` *(new — shared)*
- `src/features/billing/pricing.test.ts` *(new)*
- `src/features/billing/components/PricingSummaryCard.tsx` *(new)*
- `src/features/billing/components/PricingSummaryCard.test.tsx` *(new)*
- `src/features/billing/BillingPage.tsx`
- `src/features/integrations/components/RingbaImportPanel.tsx` *(adopts shared estimate; pre-existing Ringba flow otherwise unchanged)*

Validation rerun:
`npx vitest run src/features/billing/pricing.test.ts src/features/billing/components/PricingSummaryCard.test.tsx`

> Note: if a reviewer prefers, `RingbaImportPanel.tsx` can move to Group 7, but it then
> **must still land after** `pricing.ts`. Keeping it here avoids the cross-group dependency.

---

## Group 3 — Calls "analyze selected" affordance

Adds row-selection + the paid analyze-selected affordance to the Calls list with an
estimated-cost warning. **Depends on Group 2 (`pricing.ts`).** Server-side org scoping and
the wallet-reservation gate are unchanged — this is UI + a thin action wrapper over the
existing `/api/calls/analyze-selected` endpoint.

Files:
- `src/features/calls/CallsPage.tsx`
- `src/features/calls/components/CallsTable.tsx`
- `src/features/calls/components/CallsTable.test.tsx` *(new)*
- `src/features/calls/analyzeActions.ts` *(new — imports `pricing.ts`)*
- `src/features/calls/analyzeActions.test.ts` *(new)*
- `src/pages/app/calls/index.astro` (passes `perMinuteRateCents` to the island)

Validation rerun:
`npx vitest run src/features/calls/analyzeActions.test.ts src/features/calls/components/CallsTable.test.tsx`

---

## Group 4 — CSV import: metadata-only default + blocked-AI surfacing

Self-contained server+UI slice. CSV import stays metadata-only unless explicitly opted in
through the reservation-backed gate; the UI surfaces when AI was *not* auto-enqueued.

Files:
- `src/server/import-dispatch.ts`
- `src/server/import-dispatch.test.ts`
- `src/pages/api/imports/dispatch.ts`
- `tests/api/imports-dispatch.test.ts`
- `src/features/imports/api.ts`
- `src/features/imports/api.test.ts` *(new)*
- `src/features/imports/helpers.ts`
- `src/features/imports/helpers.test.ts`
- `src/features/imports/ImportsPage.tsx`
- `src/features/imports/ImportBatchDetailPage.tsx`
- `src/features/imports/components/NewImportCard.tsx`
- `src/features/imports/components/NewImportCard.test.tsx`

Validation rerun:
`npx vitest run src/server/import-dispatch.test.ts tests/api/imports-dispatch.test.ts src/features/imports/`

---

## Group 5 — Integration diagnostics pre-traffic guide + CallGrid placeholder

Adds the Diagnostics empty-state pre-traffic guidance (`getIntegrationPreTrafficGuide`),
a CallGrid "info / not-yet-available" card, and minor integrations nav wiring. Provider
claims in the copy are deliberately conservative (only Ringba's parsed fields are named).

Files:
- `src/features/integrations/helpers.ts` (new `getIntegrationPreTrafficGuide` + tab labels)
- `src/features/integrations/helpers.test.ts`
- `src/features/integrations/components/IntegrationDiagnosticsPanel.tsx`
- `src/features/integrations/components/IntegrationDiagnosticsPanel.test.tsx` *(new)*
- `src/features/integrations/components/CallGridInfoCard.tsx` *(new)*
- `src/features/integrations/components/CallGridInfoCard.test.tsx` *(new)*
- `src/features/integrations/IntegrationsPage.tsx`
- `src/features/integrations/components/IntegrationDetailWorkspace.tsx`
- `src/pages/app/integrations.astro`

Validation rerun:
`npx vitest run src/features/integrations/helpers.test.ts src/features/integrations/components/IntegrationDiagnosticsPanel.test.tsx src/features/integrations/components/CallGridInfoCard.test.tsx`

> Note: `helpers.ts` and `IntegrationDetailWorkspace.tsx` are shared with Groups 7/8.
> Landing this group first keeps those provider groups to provider-specific files.

---

## Group 6 — Reports CSV export

Self-contained.

Files:
- `src/features/reports/reportsCsv.ts` *(new)*
- `src/features/reports/reportsCsv.test.ts` *(new)*
- `src/features/reports/ReportsPage.tsx`

Validation rerun: `npx vitest run src/features/reports/reportsCsv.test.ts`

---

## Group 7 — TrackDrive provider (pure helper → import → wizard → settings action)

New provider helpers plus the settings `test-trackdrive-connection` action.
**Includes the one stabilization fix from the review pass:** the new action now scopes the
admin-client integration load to the caller's org (cross-org id → 404).

Files:
- `src/server/trackdrive-calls.ts` *(new — pure normalizer)*
- `src/server/trackdrive-calls.test.ts` *(new)*
- `src/server/trackdrive-import.ts` *(new — orchestration + `testTrackDriveConnection`)*
- `src/server/trackdrive-import.test.ts` *(new)*
- `src/features/integrations/components/TrackDriveConnectWizard.tsx`
- `src/features/integrations/components/TrackDriveConnectWizard.test.tsx` *(new)*
- `src/pages/api/settings/integrations.ts` (`test-trackdrive-connection` action **+ org-scope guards for admin-client integration loads**)
- `tests/api/settings-integrations.test.ts` (incl. cross-org 404 regression tests)

Validation rerun:
`npx vitest run src/server/trackdrive-calls.test.ts src/server/trackdrive-import.test.ts tests/api/settings-integrations.test.ts src/features/integrations/components/TrackDriveConnectWizard.test.tsx`

---

## Group 8 — Retreaver provider (normalizer → adapter → webhook wiring → wizard/docs)

New Retreaver webhook normalization + metadata-only ingest adapter, routed in the shared
webhook Netlify function after generic verification. Org/tenant resolved from
`x-integration-id` (`loadIntegrationContext`) — never body-supplied. Includes the
concrete wizard copy and docs.

Files:
- `src/server/retreaver-webhook.ts` *(new — normalizer)*
- `src/server/retreaver-webhook.test.ts` *(new)*
- `src/server/retreaver-ingest.ts` *(new — `ingestRetreaverWebhookCall`, `enqueueAiJobs:false`)*
- `src/server/retreaver-ingest.test.ts` *(new)*
- `netlify/functions/integration-ingest.ts` (Retreaver routing branch)
- `tests/netlify/integration-ingest.test.ts` *(new)*
- `src/features/integrations/components/RetreaverConnectWizard.tsx`
- `src/features/integrations/components/RetreaverSetupValues.tsx` *(new — exposes only `secretConfigured`/header name, never the secret value)*
- `src/features/integrations/components/RetreaverSetupValues.test.tsx` *(new — asserts the secret value never renders)*
- `src/features/integrations/wizard-content.ts` (`getRetreaverWizardSteps` context; TrackDrive step fns pre-existed)
- `src/features/integrations/wizard-content.test.ts`
- `docs/integrations.md` (Retreaver webhook section)

Validation rerun:
`npx vitest run src/server/retreaver-webhook.test.ts src/server/retreaver-ingest.test.ts tests/netlify/integration-ingest.test.ts src/features/integrations/wizard-content.test.ts src/features/integrations/components/RetreaverSetupValues.test.tsx`

---

## Group 9 — Transcript-search e2e stabilization (test-only)

No product code; safe to land in any order relative to Groups 1–8.

Files:
- `src/features/call-review/searchHelpers.test.ts` *(new — covers existing search helper)*
- `tests/e2e/reviewer-workflow.spec.ts` (selector/wait hardening)

Validation rerun: `npx vitest run src/features/call-review/searchHelpers.test.ts`
(e2e: see residual risks — currently environmentally blocked.)

---

## Group 10 — Overnight ops docs & tooling (NOT product; keep separate / may stay local)

Operational artifacts of the overnight loop. These do not belong in product PRs — land as
a separate housekeeping commit, or leave local.

Files:
- `docs/product/flow-map.md` *(new)*
- `docs/product/overnight-status.md` *(new)*
- `docs/product/overnight-handoff.md` *(new)*
- `docs/product/overnight-execution-2026-06-01.md` *(new)*
- `docs/product/overnight-prompts-2026-06-01.md` *(new)*
- `docs/product/claude-current-prompt.md` *(new — supervisor scratch)*
- `docs/product/review-split-plan.md` *(this file)*
- `scripts/send-claude-and-verify.sh` *(new — overnight tmux/print prompt delivery)*

Validation: none (docs/script). `scripts/send-claude-and-verify.sh` is a local harness,
not wired into `ci:verify`.

---

## Residual blockers / risks

1. **Admin-client org-scoping hardening is already included in this working tree.**
   `src/pages/api/settings/integrations.ts` now rejects cross-org integration ids before
   running `sync-ringba-api`, `test-ringba-connection`, `test-trackdrive-connection`, or
   `send-test-event`. Regression coverage is in `tests/api/settings-integrations.test.ts`.
   Focused validation on 2026-06-02 16:24 EDT:
   `npx vitest run tests/api/settings-integrations.test.ts` -> 18/18 pass.

2. **e2e auth setup has been re-validated.** The prior Playwright global setup login drift
   did not reproduce after the local e2e setup restarted services and seeded the test org.
   `npm run test:e2e` passed 14/14 on 2026-06-02 16:26 EDT.

3. **Prompt-submission fallback (overnight harness only).** `overnight-status.md` records
   `Last prompt verification: no` with a print fallback log
   (`docs/product/overnight-claude-print.log`); prompt delivery is via `tmux` send-keys
   (`scripts/send-claude-and-verify.sh`). This is loop-tooling reliability, not a product
   risk — but it means the batch may contain work from prompts whose receipt wasn't
   positively confirmed. Reviewer should sanity-check that each group's scope matches an
   intended prompt before merging.

4. **Working tree is intentionally dirty and `main` is ahead of `origin`.** Nothing has
   been committed/staged/pushed by the overnight loop. Splitting per this plan is the
   first commit-producing step and should be done with human review.

## Verdict

**Review split plan is ready.** Ten ordered groups (8 product slices + 1 test-only + 1
ops-docs), each independently testable, with shared-helper dependencies called out
(`pricing.ts` → Groups 2→3; `app-data.ts`/`integrations/helpers.ts`/`IntegrationDetailWorkspace`
land early to keep later groups provider-local). The full batch is already green under
`ci:verify`, and full e2e is green; per-group rerun commands are listed above. The prior
Ringba org-scoping and e2e auth-drift concerns have been re-checked in this working tree.
The remaining work is packaging/review: split the dirty batch by the groups above before
commit or PR review.
