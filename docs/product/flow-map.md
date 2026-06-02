---
title: Product Flow Map
owner: Product / Engineering
last-reviewed: 2026-06-01
---

# DependableQA Product Flow Map

This is the **as-built** map of the end-to-end user journey through DependableQA, derived
from the current code (not aspirational). It exists to answer one question for any screen:
*what does the user do next, and where does the UI take them?* For the deep workspace
spec see [`call-review-spec.md`](call-review-spec.md) and [`prd.md`](prd.md); for ingest
mechanics see [`../integrations.md`](../integrations.md); for the schema see
[`../data-model.md`](../data-model.md).

## Roles (who sees what)

Org membership carries a role (`owner`, `admin`, `reviewer`, `analyst`, `billing`); see
[architecture.md](../architecture.md#roles--permissions). Relevant gates in the flows below:

- **Billing actions** (add funds, auto-recharge, payment method) — surfaced to owner/admin/billing.
- **Connect / configure an integration, run a Ringba import** — owner/admin only.
- **Queue paid AI analysis** (`analyze-selected`) — `AI_SPEND_ROLES`.
- **Review calls / override dispositions** — reviewers (and owner/admin).

The left nav (`src/components/app-shell/AppShell.tsx`) is **not** role-hidden today;
permission is enforced in loaders/handlers and individual cards, not by hiding nav links.

## Navigation spine

`AppShell` renders a fixed left sidebar for every `/app/**` page:

| Nav item | Route | Purpose |
|---|---|---|
| Overview | `/app/overview` | Landing dashboard + **Getting started** checklist (below) |
| Calls | `/app/calls` | The call queue → review workspace |
| Imports | `/app/imports` | CSV upload + batch history |
| Integrations | `/app/integrations` | Connect/monitor call providers |
| Reports | `/app/reports` | (placeholder — export/saved reports "soon") |
| Billing | `/app/billing` | Wallet, add funds, auto-recharge, ledger, runway |
| Settings | `/app/settings/profile` | Profile · Organization · Team · API keys · Alerts |
| Updates | `/app/updates` | Product updates |

---

## The ten core flows

### 1. First account / org setup

`signup.astro` → email/password → **`onboarding.astro`** (`src/pages/onboarding.astro`).
If the user already has a membership, onboarding redirects straight to `/app/overview`.
Otherwise a single form ("Create your first organization") calls `createOrganizationForUser`
(service-role, atomic owner-membership) and sets the active-org cookie. **Lands on
`/app/overview`.**

**Next step (post-2026-06-01):** Overview now shows a **Getting started** checklist
(`src/features/overview/GettingStartedChecklist.tsx`) that sequences the remaining setup —
*Add funds → Connect a provider or import calls → Run AI analysis → Complete a review* —
each with a deep link to the right page. It auto-hides once all four are done, so
established orgs see the normal dashboard. This is the connective tissue that previously
forced new orgs to guess where to go from an all-zero dashboard.

### 2. Add funds / wallet / auto-recharge

`/app/billing` (`src/features/billing/BillingPage.tsx`). The wallet model: an org **prepays
a balance**; processing a call **debits** the wallet at `per_minute_rate_cents` × billable
minutes (see [data-model.md](../data-model.md#wallet-ledger-invariant)). Sections:

- **BalanceCard** — current balance, recharge threshold, "Add funds".
- **AddFundsModal** — amount → Stripe Checkout (`/api/billing/fund-checkout`).
- **AutoRechargeCard / EditAutoRechargeModal** — when balance < threshold, auto-charge a
  recharge amount (requires a saved card).
- **PaymentMethodCard** — set up / update card (`/api/billing/setup-checkout`, portal).
- **RunwayCard** — projected days remaining at current burn (`deriveBillingRunwaySummary`).
- **WalletLedgerTable / BillingEventList** — debit/credit history and recharge events.

Stripe credits are idempotent/transactional (`apply_stripe_recharge_event`, migration `0009`).

### 3. Connect a provider

`/app/integrations` (`src/features/integrations/IntegrationsPage.tsx`). Empty state:
*"Connect your first call platform — start with Ringba…"*. Provider maturity:

| Provider | Connect UX | Ingest depth |
|---|---|---|
| **Ringba** | `RingbaConnectWizard` | Most complete: pixel, scheduled API sync, manual full-API import |
| **Retreaver** | `RetreaverConnectWizard` | Guided setup; webhook is the official/recommended real-time path |
| **TrackDrive** | `TrackDriveConnectWizard` | Guided setup; official calls API (Basic auth, cursor paging, `recording_url`) |
| **Custom** | `CustomIntegrationInfoCard` | Generic signed-webhook endpoint |

After connecting, the per-integration **IntegrationDetailWorkspace** exposes Overview /
Setup-or-Pixel / Security / Health tabs. Only owner/admin can create an integration.

### 4. Import calls

Two entry points, by design kept **separate from paid analysis**:

- **CSV upload** — `/app/imports` (`ImportsPage` → `NewImportCard`/`ImportDropzone`). Auto-
  detect or pick a provider; fields are auto-mapped; upload dispatches
  `/api/imports/dispatch` → `import-dispatch.ts`; redirects to
  `/app/imports/[batchId]` showing accepted/rejected rows. **Metadata-only by default**
  (*as of 2026-06-01*): the route passes `enqueueAiJobs: false` unless the user ticks
  "Analyze with AI after import" on the upload card (which warns about wallet spend). This
  matches the Ringba API import and routes paid AI through the explicit gates below. (Live
  `webhook`/`pixel` ingest still auto-enqueues — real-time, low-volume — unchanged.)
- **Ringba full-API import** — `RingbaImportPanel` on the integration page. Imports
  recording **metadata only** (`enqueueAiJobs: false`) so a historical backfill of
  thousands of calls is **not** silently billed. See
  [integrations.md](../integrations.md#ai-cost-control-on-ingest).

### 5. Select calls for AI analysis (paid gate)

The single paid-AI entry point is `POST /api/calls/analyze-selected`
(`enqueueAnalysisForCalls`): it scopes every call id to the caller's org, enforces a max
batch, reserves wallet funds, and **refuses up front (402)** if the estimate exceeds the
balance. This gate is surfaced in two places:

- **Ringba import panel** (`RingbaImportPanel`) — "Analyze selected" / "Analyze all
  imported", right after a manual full-API import.
- **Calls list** (`/app/calls`) — *added 2026-06-01.* Row checkboxes + a select-all header
  drive a "Analyze N selected" action bar (with a cost estimate) that POSTs the selected
  call ids to the same endpoint. The bar only renders for `AI_SPEND_ROLES`
  (`canAnalyze`, computed server-side in `calls/index.astro`); the route re-checks the role
  and org-scopes every id regardless of the UI. Skipped calls (no media / not in org /
  already queued) are summarized back in a notice (`summarizeAnalyzeResult`).

### 6. Review queue triage

`/app/calls` (`src/features/calls/CallsPage.tsx`). The table **is** the queue. Preset
filters act as queues: **All · Flagged · Needs Review · Today · This Month · Compliance**.
Empty state: *"No calls found yet. Import a batch or connect an integration."* Columns are
customizable; saved views persist. Clicking a row opens **CallDetailDrawer** (quick triage:
Overview / Transcript / Analysis / Flags / Audit) with **"Open Full Page"** →
`/app/calls/[callId]`.

### 7. Human QA review workspace

`/app/calls/[callId]` (`src/features/call-review/CallReviewWorkspace.tsx`). Three-pane:
**CallOutline** (AI moments) · **Waveform + Transcript** (search, click-to-seek, auto-
follow) · **QaPanel** (Summary / Flags / Notes). Keyboard-first (`Space`, `/`, `f`, `n`,
`[`/`]`, arrows). Deep-linkable via `?t=` and `?flag=`. Flags can be created from a segment,
selection, waveform drag, or `f`; notes are timestamp-anchored.

### 8. Final review / disposition

`CallReviewActions` (right rail). Reviewer can **Confirm Disposition**, **Mark In Review**,
**Reopen**, **Save Review Note**, and **Override Disposition** (value + reason). Writes
`call_reviews` + `disposition_overrides`, rolls up `calls.current_disposition` /
`current_review_status`, and writes an audit log — no page reload.

### 9. Manager follow-up on flags

Managers triage via the **Flagged** / **Compliance** preset queues on `/app/calls`, open a
call, and use deep links (`?flag=`) to jump straight to a flagged moment. Flags carry
category/severity/status; resolving a flag preserves the timestamped evidence. Open-flag
counts surface on **Overview** ("open flags", "calls requiring review") and in
**Needs Attention**.

### 10. Onboarding another agency user / team member

`/app/settings/team` (`TeamSettingsPage`). Owner/admin manage members and roles; new members
authenticate, and if they have no org they pass through `onboarding.astro`. Role determines
which of the flows above they can act on (see Roles).

---

## Gaps surfaced by this map (ship-readiness backlog)

1. **First-run dead-end on Overview** — *addressed 2026-06-01* by the Getting-started
   checklist (flow 1).
2. **No "analyze" affordance on the Calls list** — *addressed 2026-06-01* by row-select +
   "Analyze N selected" bar wired to `/api/calls/analyze-selected` (flow 5).
3. **Reports is a placeholder** — buttons are disabled ("soon").
4. **Integration health is post-connect only** — *addressed 2026-06-01*: the Diagnostics
   pre-traffic empty state now frames "no events yet" as expected (not broken), surfaces the
   next verification the user can run now (reusing `getIntegrationNextStep`), and lists what
   will appear after the first call — provider-accurate (`getIntegrationPreTrafficGuide`; only
   Ringba's parsed fields are named). Live post-traffic diagnostics are unchanged.
5. **Wallet pricing is implicit** — *addressed 2026-06-01*: the Billing page has a "How you're
   billed" panel (`PricingSummaryCard`), **and** the in-context analyze estimates on the Calls
   list and the Ringba import panel now use the real model
   (`perMinuteRateCents × billableMinutes(duration)`, rounded up, 1-min min) via the shared
   `estimateBatchCostLabel` helper — no more flat ~$0.03/call. Zero-rate orgs show a clear
   "not metered" message. The org rate is read server-side (org-scoped service-role) and passed
   into the islands.
6. **CSV import auto-spent on AI** — *addressed 2026-06-01*: CSV import was the lone ingest
   path that silently queued paid AI for every row with no wallet gate. It is now metadata-only
   by default with an explicit, wallet-aware opt-in (flow 4). Remaining: the opt-in path
   doesn't yet reserve funds up front like `analyze-selected` (it relies on the on-completion
   debit's never-negative clamp); a future loop could route it through the reservation.
