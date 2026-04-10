Absolutely. Here is the rebuild blueprint.

I am going to treat this like a product-spec handoff that design, frontend, backend, and data engineers could all work from immediately.

The current ConvoQC app shown in your screenshots is centered on five core surfaces—Dashboard, Call Logs, Integrations, Billing, and Settings—with Call Logs serving as the operational core, including sortable/filterable call records and CSV imports from Ringba, TrackDrive, and Retreaver. The uploaded markup also confirms additional shell items like Ask AI and Updates in the nav.

The Netlify starter you chose is a minimal Astro + Supabase template for Netlify, with Astro, the Netlify adapter, Supabase JS, TypeScript, and Tailwind v4 via Vite already present. It currently uses a very simple `src/pages/index.astro` + `src/utils/database.ts` pattern and a lightweight Astro layout.

# 1. Product thesis

This rebuild should not be “a prettier admin panel.”

It should be a call-QA operations system with five defining properties:

1. Every imported call is traceable.
2. Every AI decision is reviewable.
3. Every manual override is auditable.
4. Every operational view is filterable and saveable.
5. Every important state change is visible, not hidden.

That means the app must be built around:

* immutable source data
* editable normalized QA data
* explicit review workflows
* first-class import batches
* strong permissions
* event/audit history

# 2. Core product decisions

## 2.1 Stack decision

Use the Netlify Astro starter as the shell, but evolve it into an authenticated SSR app with React islands for high-interactivity surfaces.

Recommended stack:

* Astro for routing, SSR, app shell, layouts
* React for tables, filters, drawers, forms, modals, settings UIs
* Tailwind v4 for styling
* Supabase for Auth, Postgres, Storage, Realtime
* Stripe for subscription, wallet/recharge, invoice/customer portal
* Netlify for deployment, server functions, webhook endpoints
* Zod for validation
* React Hook Form for forms
* TanStack Table for complex table UX
* TanStack Query for client data orchestration
* Radix primitives or equivalent headless UI base for popovers, dialogs, tabs, dropdowns
* Postgres full-text search for transcript and metadata search
* Optional pgvector later, but not required for V1

## 2.2 Architectural decision

Do not build this as a pure SPA.

Use:

* Astro pages for route-level SSR and auth gating
* React islands for each complex screen section
* server-side loaders for initial state
* client-side query invalidation for fast updates

That gives:

* fast first paint
* good Netlify deployment ergonomics
* better auth and SEO defaults
* less client-side boot weight
* controlled hydration only where needed

## 2.3 Product model decision

Separate data into three layers:

1. Source layer
   Raw platform truth. What came from Ringba/TrackDrive/Retreaver/import file.

2. Normalized layer
   Clean, canonical call record and mapped entities like campaign, publisher, duration, phone, timestamps.

3. QA layer
   Disposition, flags, notes, review state, overrides, escalation, audit history.

That separation is non-negotiable.

Without it, bad imports and reclassification workflows become impossible to manage cleanly.

# 3. Proposed sitemap

## 3.1 V1 production sitemap

### Public/auth

* `/`
* `/login`
* `/signup`
* `/forgot-password`
* `/reset-password`
* `/invite/accept`

### App shell

* `/app`
* `/app/overview`
* `/app/calls`
* `/app/calls/[callId]`
* `/app/imports`
* `/app/imports/[batchId]`
* `/app/integrations`
* `/app/reports`
* `/app/billing`
* `/app/settings/profile`
* `/app/settings/team`
* `/app/settings/alerts`
* `/app/settings/organization`
* `/app/settings/api`
* `/app/updates`
* `/app/ai`

## 3.2 Recommended nav structure

### Primary nav

* Overview
* Calls
* Imports
* Integrations
* Reports

### Secondary nav

* Billing
* Settings
* Ask AI
* Updates

## 3.3 Why this sitemap is better than the current one

The current app is settings-heavy in the top-level nav. That is acceptable for a small tool, but not ideal for an operations product. The improved IA separates:

* operational work
* configuration
* support/assistive tools

That reduces cognitive switching.

# 4. User roles and permissions

Use role-based access from day one.

## 4.1 Roles

| Role     | Purpose                                                      |
| -------- | ------------------------------------------------------------ |
| Owner    | Full org control, billing, team, integrations, all QA data   |
| Admin    | Operational + configuration access except ownership transfer |
| Reviewer | Can review calls, override dispositions, add notes, export   |
| Analyst  | Read-only plus reporting/export, no destructive actions      |
| Billing  | Billing-only access, invoices, recharge settings             |

## 4.2 Permission model

Permissions should be explicit, not implied.

Core permission groups:

* org.manage
* billing.manage
* integrations.manage
* team.manage
* alerts.manage
* calls.read
* calls.review
* calls.override
* imports.manage
* exports.run
* ai.use

## 4.3 Rationale

The current Team screen suggests role presence, but not a mature permissions model. The rebuild should not fake permissions with UI-only hiding. Permissions must be enforced in:

* RLS
* server loaders
* UI routing
* action handlers

# 5. Core domain model

Here is the canonical product model.

## 5.1 Entities

| Entity                | What it represents               | Why it exists                 |
| --------------------- | -------------------------------- | ----------------------------- |
| Organization          | customer account/workspace       | multi-tenant boundary         |
| Profile               | user identity metadata           | user settings and display     |
| Organization Member   | user membership in org           | roles and access              |
| Integration           | a configured source connection   | source management             |
| Integration Event     | source heartbeat/error history   | health and troubleshooting    |
| Import Batch          | one uploaded import operation    | batch traceability            |
| Import File           | uploaded CSV artifact            | file provenance               |
| Import Row Error      | rejected/invalid row info        | import debugging              |
| Publisher             | normalized traffic source        | filtering and attribution     |
| Campaign              | normalized buyer/campaign entity | reporting and filtering       |
| Call                  | canonical call record            | primary operational object    |
| Call Source Snapshot  | raw source payload/row           | immutable trace source        |
| Call Transcript       | transcript and search document   | search and QA                 |
| Call Analysis         | AI result package                | explainability and versioning |
| Call Flag             | individual flag raised on a call | operational review            |
| Call Review           | human review outcome             | QA workflow                   |
| Disposition Override  | manual reclassification event    | auditability                  |
| Saved View            | stored filter/table config       | speed and personalization     |
| Alert Rule            | notification logic               | operational automation        |
| Notification Delivery | actual sent notification record  | observability                 |
| Billing Account       | org billing metadata             | Stripe linkage                |
| Wallet Ledger Entry   | prepaid balance movements        | recharge transparency         |
| Audit Log             | system and human actions         | trust and traceability        |

# 6. Recommended Supabase schema

Below is the practical schema I would implement.

## 6.1 Identity and org tables

### `profiles`

* `id uuid pk` references `auth.users`
* `email text`
* `first_name text`
* `last_name text`
* `avatar_url text`
* `created_at timestamptz`
* `updated_at timestamptz`

### `organizations`

* `id uuid pk`
* `name text`
* `slug text unique`
* `status text`
* `created_at`
* `updated_at`

### `organization_members`

* `id uuid pk`
* `organization_id uuid`
* `user_id uuid`
* `role text`
* `invited_by uuid nullable`
* `invite_email text nullable`
* `invite_status text`
* `created_at`
* `updated_at`

## 6.2 Operational source tables

### `integrations`

* `id uuid pk`
* `organization_id uuid`
* `provider text` enum-like: `ringba`, `retreaver`, `trackdrive`, `custom`
* `display_name text`
* `status text` (`connected`, `degraded`, `error`, `disconnected`)
* `mode text` (`csv`, `webhook`, `pixel`, `api`)
* `config jsonb`
* `last_success_at timestamptz`
* `last_error_at timestamptz`
* `created_at`
* `updated_at`

### `integration_events`

* `id uuid pk`
* `organization_id uuid`
* `integration_id uuid`
* `event_type text`
* `severity text`
* `message text`
* `payload jsonb`
* `created_at`

### `import_batches`

* `id uuid pk`
* `organization_id uuid`
* `integration_id uuid nullable`
* `source_provider text`
* `source_kind text` (`csv`, `api`, `webhook`)
* `uploaded_by uuid`
* `filename text`
* `storage_path text`
* `status text` (`uploaded`, `validating`, `processing`, `completed`, `partial`, `failed`, `archived`)
* `row_count_total int`
* `row_count_accepted int`
* `row_count_rejected int`
* `started_at timestamptz`
* `completed_at timestamptz`
* `created_at`

### `import_row_errors`

* `id uuid pk`
* `organization_id uuid`
* `import_batch_id uuid`
* `row_number int`
* `error_code text`
* `error_message text`
* `raw_row jsonb`
* `created_at`

## 6.3 Normalized business entities

### `publishers`

* `id uuid pk`
* `organization_id uuid`
* `name text`
* `normalized_name text`
* `external_refs jsonb`
* `status text`
* `created_at`
* `updated_at`

### `campaigns`

* `id uuid pk`
* `organization_id uuid`
* `name text`
* `normalized_name text`
* `external_refs jsonb`
* `status text`
* `created_at`
* `updated_at`

## 6.4 Call tables

### `calls`

* `id uuid pk`
* `organization_id uuid`
* `import_batch_id uuid nullable`
* `integration_id uuid nullable`
* `publisher_id uuid nullable`
* `campaign_id uuid nullable`
* `external_call_id text nullable`
* `caller_number text`
* `destination_number text nullable`
* `started_at timestamptz`
* `ended_at timestamptz nullable`
* `duration_seconds int`
* `recording_url text nullable`
* `recording_storage_path text nullable`
* `source_provider text`
* `source_status text`
* `current_disposition text nullable`
* `current_review_status text` default `unreviewed`
* `has_flags boolean`
* `flag_count int`
* `analysis_status text`
* `search_document tsvector nullable`
* `created_at`
* `updated_at`

### `call_source_snapshots`

* `id uuid pk`
* `organization_id uuid`
* `call_id uuid`
* `source_provider text`
* `source_kind text`
* `raw_payload jsonb`
* `normalized_payload jsonb`
* `mapping_version text`
* `created_at`

### `call_transcripts`

* `id uuid pk`
* `organization_id uuid`
* `call_id uuid`
* `transcript_text text`
* `transcript_segments jsonb`
* `language text`
* `confidence numeric`
* `search_document tsvector`
* `created_at`
* `updated_at`

### `call_analyses`

* `id uuid pk`
* `organization_id uuid`
* `call_id uuid`
* `analysis_version text`
* `model_name text`
* `summary text`
* `disposition_suggested text`
* `confidence numeric`
* `flag_summary jsonb`
* `structured_output jsonb`
* `processing_ms int`
* `created_at`

### `call_flags`

* `id uuid pk`
* `organization_id uuid`
* `call_id uuid`
* `flag_type text`
* `flag_category text`
* `severity text`
* `status text` (`open`, `dismissed`, `confirmed`)
* `source text` (`ai`, `rule`, `manual`)
* `title text`
* `description text`
* `evidence jsonb`
* `created_at`
* `updated_at`

### `call_reviews`

* `id uuid pk`
* `organization_id uuid`
* `call_id uuid`
* `reviewed_by uuid`
* `review_status text`
* `final_disposition text`
* `review_notes text`
* `resolved_flags jsonb`
* `created_at`

### `disposition_overrides`

* `id uuid pk`
* `organization_id uuid`
* `call_id uuid`
* `previous_disposition text`
* `new_disposition text`
* `reason text`
* `changed_by uuid`
* `created_at`

## 6.5 User productivity tables

### `saved_views`

* `id uuid pk`
* `organization_id uuid`
* `user_id uuid`
* `name text`
* `entity_type text` default `calls`
* `is_default boolean`
* `config jsonb`
* `created_at`
* `updated_at`

### `alert_rules`

* `id uuid pk`
* `organization_id uuid`
* `name text`
* `is_enabled boolean`
* `trigger_config jsonb`
* `delivery_config jsonb`
* `cooldown_minutes int`
* `created_by uuid`
* `created_at`
* `updated_at`

### `notification_deliveries`

* `id uuid pk`
* `organization_id uuid`
* `alert_rule_id uuid`
* `event_type text`
* `destination text`
* `status text`
* `payload jsonb`
* `created_at`

## 6.6 Billing tables

### `billing_accounts`

* `id uuid pk`
* `organization_id uuid`
* `stripe_customer_id text`
* `stripe_subscription_id text nullable`
* `billing_email text`
* `autopay_enabled boolean`
* `recharge_threshold_cents int`
* `recharge_amount_cents int`
* `per_minute_rate_cents int`
* `currency text`
* `created_at`
* `updated_at`

### `wallet_ledger_entries`

* `id uuid pk`
* `organization_id uuid`
* `billing_account_id uuid`
* `entry_type text` (`credit`, `debit`, `recharge`, `adjustment`, `refund`)
* `amount_cents int`
* `balance_after_cents int`
* `reference_type text`
* `reference_id uuid nullable`
* `description text`
* `created_at`

## 6.7 Audit table

### `audit_logs`

* `id uuid pk`
* `organization_id uuid`
* `actor_user_id uuid nullable`
* `entity_type text`
* `entity_id uuid`
* `action text`
* `before jsonb nullable`
* `after jsonb nullable`
* `metadata jsonb`
* `created_at`

# 7. Database design notes that matter

## 7.1 Search

Do not search directly across multiple raw tables ad hoc.

Use a unified search approach:

* `calls.search_document`
* `call_transcripts.search_document`

At minimum support:

* caller number
* campaign
* publisher
* disposition
* flags
* transcript text

## 7.2 Deduplication

Add a deterministic duplicate guard for source imports:

* `organization_id`
* `source_provider`
* `external_call_id`
* or fallback composite hash on timestamp + caller + duration + campaign

You do not want duplicate calls inflating metrics.

## 7.3 Immutable vs mutable

Immutable:

* source snapshot
* import row
* original external IDs
* raw transcript source

Mutable:

* final disposition
* review state
* manual notes
* alert config
* saved views

## 7.4 Why this matters

This is the exact fix for your stated pain: bad imports and wrong system classifications.

Instead of “editing the original row,” you preserve source truth and layer controlled overrides above it.

# 8. Supabase RLS strategy

RLS should be strict and boring.

## 8.1 Core principle

Every tenant-owned row includes `organization_id`.

Access is granted only when the authenticated user is a member of that organization.

## 8.2 Example policy pattern

For read:

* user must exist in `organization_members`
* membership must match row `organization_id`

For write:

* same as above
* plus role check for elevated actions

## 8.3 Role-based enforcement examples

Reviewer can:

* read calls
* create reviews
* create override events
* add notes

Analyst can:

* read calls
* export
* save views
* not change dispositions

Billing can:

* read billing
* manage recharge
* not read full call content unless granted

## 8.4 Service-role boundary

Never expose service-role key in app runtime.

Use service-role only inside:

* Netlify functions
* secure server-side job handlers
* Stripe webhook handlers
* privileged import processors

# 9. Event and data flow

This is the most important operational flow in the system.

## 9.1 CSV import flow

1. User opens Import Calls.
2. User selects provider type or auto-detect.
3. CSV uploads to Supabase Storage.
4. `import_batches` row created with `uploaded`.
5. Background processor validates headers.
6. Row mapping executes.
7. Rejected rows stored in `import_row_errors`.
8. Accepted rows normalize into `calls`.
9. Raw source snapshot stored.
10. Transcript/AI analysis job queued if needed.
11. Metrics refresh.
12. Batch marked `completed` or `partial`.

## 9.2 Live integration flow

1. Platform posts event/webhook/pixel.
2. Integration endpoint validates signature/config.
3. Source payload stored.
4. Call normalized.
5. Transcript/analysis pipeline runs.
6. Flags/disposition emitted.
7. Alert rules evaluate.
8. Deliveries logged.

## 9.3 Review flow

1. Reviewer opens call detail.
2. Reviewer inspects transcript, summary, flags, evidence.
3. Reviewer confirms or overrides disposition.
4. Reviewer dismisses or confirms flags.
5. `call_reviews` and `disposition_overrides` created.
6. `calls.current_disposition` and `current_review_status` update.
7. Audit log written.

## 9.4 Billing flow

1. Minutes processed or usage event recorded.
2. Wallet debit entry created.
3. If threshold crossed and recharge enabled, Stripe charge initiated.
4. Recharge succeeds or fails.
5. `wallet_ledger_entries` updated.
6. Billing state displayed in UI.

# 10. Page-by-page wireframe spec

# 10.1 App shell

## Purpose

Universal structure for all authenticated pages.

## Layout

* Left sidebar
* Top utility bar inside content region
* Main page canvas
* Optional right-side contextual panel/drawer
* Mobile bottom nav

## Regions

### Sidebar

* Logo
* Primary nav
* Secondary nav
* Org switcher if needed later
* User menu
* Collapse

### Top utility bar

* Current page title
* Date range context when relevant
* Global search entry point
* Notifications
* User/profile menu

### Page canvas

* Max-width rules vary by page type
* Table pages use wider canvas
* Settings pages use medium-width canvas

## Improvements over current app

* Remove dead empty margins
* Unify page header spacing
* Add active filter context
* Add system-status strip when there are warnings

# 10.2 Overview page

## Goal

Operational landing page, not just account summary.

## Layout blocks

1. Status strip
2. KPI row
3. Risk/attention row
4. Recent imports
5. Flag trend snapshot
6. Billing health
7. Integration health

## Block spec

### Status strip

Shows:

* system active
* last import success
* last analysis run
* issues requiring action

### KPI row

Cards:

* Account balance
* Calls this month
* Minutes this month
* Flag rate
* Disqualification rate

### Needs attention

Cards:

* low balance
* disconnected integration
* failed import
* spike in flagged publisher
* unresolved high-severity flags

### Recent imports

Table:

* batch
* provider
* accepted/rejected rows
* created at
* status
* action

### Billing health

* recharge threshold
* projected runway
* last recharge
* payment failures if any

### Integration health

* provider
* status
* last event
* errors
* action

## Key interaction

Every card either drills into a filtered operational view or opens a corrective workflow.

# 10.3 Calls index page

This is the core page.

## Goal

Fast triage, search, filtering, and drill-in on analyzed calls.

## Layout blocks

1. Page header
2. KPI/filter summary row
3. Saved views bar
4. Table toolbar
5. Data table
6. Right-side detail drawer on row select

## Page header

* title
* subtitle
* Import Calls button
* Export button
* Help/tour

## KPI/filter summary row

Cards:

* Sales Made
* Disqualified
* Flagged Calls
* Compliance flags
* Top flagged publishers

Each card acts as a filter shortcut.

## Saved views bar

Presets:

* All Calls
* Flagged
* Needs Review
* Today
* This Month
* Compliance
* My Saved Views

## Table toolbar

Controls:

* search input
* date range
* filter builder
* active filter chips
* columns picker
* density toggle
* saved view menu
* export menu
* bulk actions when rows selected

## Table columns, V1

* Date/Time
* Caller Number
* Campaign
* Publisher
* Duration
* Disposition
* Review Status
* Flag Count
* Top Flag
* Source Provider
* Import Batch
* Reviewed By
* Last Updated

## Required behaviors

* server-side sort
* server-side filter
* transcript search
* sticky header
* keyboard row nav
* row selection
* click row opens drawer
* caller number copy
* empty state
* loading skeletons

## Right-side call detail drawer

Tabs:

* Overview
* Transcript
* Analysis
* Flags
* Audit

Actions:

* confirm disposition
* override disposition
* dismiss/confirm flags
* add review note
* rerun analysis
* open full page
* link to import batch

This drawer is the single highest-value UX addition in the rebuild.

# 10.4 Call detail page

## Goal

Deep inspection and review for one call.

## Layout

* Header with call identity and quick stats
* Sticky left summary column
* Main content tabs

## Header

* caller number
* campaign
* publisher
* source
* date/time
* duration
* current disposition
* review state
* severity summary

## Tabs

### Overview

* AI summary
* metadata
* source details
* linked import batch
* related duplicate check

### Transcript

* transcript text
* speaker segments
* search within transcript
* jump-to-evidence timestamps

### Analysis

* suggested disposition
* confidence
* model/version
* extracted signals
* structured reasoning summary

### Flags

* each flag card
* severity
* evidence
* reviewer action buttons

### Audit

* import event
* analysis event
* override history
* review history
* alerts sent

## Actions area

Persistent:

* mark reviewed
* override disposition
* reopen review
* add internal note

# 10.5 Imports page

## Goal

First-class ingestion management.

## Layout blocks

1. Import header
2. Import actions
3. Recent batches table
4. Batch health summary
5. Common errors panel

## Import actions

* Upload CSV
* Download template
* View docs
* Create custom mapping

## Recent batches table

Columns:

* filename
* provider
* uploaded by
* total rows
* accepted
* rejected
* status
* created at
* actions

## Batch actions

* view details
* archive
* retry processing
* export errors
* delete batch if no calls attached
* rollback imported calls if policy allows

## Batch detail page

Sections:

* batch metadata
* header detection
* mapping summary
* accepted rows sample
* rejected rows list
* created calls list
* rollback/audit actions

This is another major upgrade over the current product.

# 10.6 Import wizard/modal

## Steps

1. Choose source
2. Upload file
3. Validate headers
4. Preview mapping
5. Resolve warnings
6. Confirm import
7. Track processing

## UI rules

* never import blindly
* always show counts before commit
* preserve source file and row failures
* let users preview mapped fields

# 10.7 Integrations page

## Goal

Configuration + health, not just “connect buttons.”

## Layout blocks

1. Connected integrations cards
2. Setup guide panel
3. Event health log
4. API credentials
5. Test tools

## Each integration card

* provider icon/name
* mode
* connection state
* last successful event
* last failed event
* error count last 24h
* reconfigure button
* test connection button
* docs link

## Detail drawer/page per integration

* setup instructions
* required parameters
* endpoint details
* sample payload
* health history
* retries
* signature/auth settings

# 10.8 Reports page

## Goal

Decision support, not vanity charts.

## Reports V1

* Call volume
* Dispositions by date
* Flags by publisher
* Flags by campaign
* Compliance trend
* Import error trend
* Reviewer throughput

## UX

* filters same as Calls
* saved report presets
* export CSV/PDF

# 10.9 Billing page

## Goal

Transparent and predictable commercial state.

## Layout blocks

1. Billing summary
2. Wallet/recharge health
3. Payment methods
4. Invoices
5. Usage ledger
6. Stripe customer portal entry

## Billing summary

* current balance
* projected days left
* monthly processed minutes
* current rate
* next recharge behavior

## Wallet/recharge card

* threshold
* recharge amount
* autopay status
* last success
* last failure

## Usage ledger

Do not hide spend mechanics.
Show:

* timestamp
* type
* amount
* balance after
* reference

# 10.10 Settings pages

## Profile

Straightforward user profile and password/security.

## Team

* members
* roles
* invite state
* resend invite
* revoke access

## Alerts

* rule-based alert builder
* destinations
* severity
* cooldown
* quiet hours
* per-campaign/per-publisher targeting

## Organization

* org name
* slug
* billing contact
* timezone
* default review settings

## API

* org API keys
* scope
* created by
* last used
* revoke/regenerate

# 10.11 Ask AI page

## Goal

Operator assistant, not chatbot theater.

## Good use cases

* “Show me all WhiteRock calls flagged for compliance in the last 7 days”
* “Summarize why disqualified calls rose yesterday”
* “Which publisher has the highest dead air rate this month?”
* “Explain this call’s flags in plain English”

## Guardrails

* AI never bypasses permissions
* AI should return linked records and filters
* AI answers should be grounded in actual data slices

# 11. Component architecture

Use a domain-driven React component structure.

## 11.1 Design system layer

`src/components/ui/`

Core primitives:

* Button
* IconButton
* Input
* SearchInput
* Select
* MultiSelect
* Checkbox
* RadioGroup
* Switch
* Badge
* StatusDot
* Card
* SectionCard
* Tabs
* Dialog
* Drawer
* Popover
* DropdownMenu
* Tooltip
* Table
* DataTableShell
* Pagination
* DateRangePicker
* EmptyState
* Skeleton
* Toast
* CommandPalette

These should be brand-neutral and reusable.

## 11.2 App shell layer

`src/components/app-shell/`

* AppShell
* Sidebar
* SidebarNavItem
* MobileNav
* TopBar
* PageHeader
* StatusStrip
* UserMenu
* OrgMenu

## 11.3 Feature modules

`src/features/calls/`

* CallsPage
* CallsToolbar
* CallsTable
* CallsFilters
* SavedViewsBar
* CallDetailDrawer
* CallTranscriptPanel
* CallFlagsPanel
* CallReviewForm
* CallAuditTimeline

`src/features/imports/`

* ImportsPage
* ImportWizard
* ImportDropzone
* ImportMappingPreview
* ImportBatchTable
* ImportErrorsTable
* ImportBatchDetail

`src/features/integrations/`

* IntegrationsPage
* IntegrationCard
* IntegrationHealthBadge
* IntegrationSetupGuide
* IntegrationEventLog

`src/features/billing/`

* BillingPage
* WalletSummaryCard
* RechargeSettingsForm
* PaymentMethodsCard
* InvoiceTable
* UsageLedgerTable

`src/features/settings/`

* ProfileSettingsForm
* TeamMembersTable
* InviteMemberForm
* AlertRulesBuilder
* ApiKeysTable

`src/features/reports/`

* ReportsPage
* MetricTiles
* TrendChart
* BreakdownTable
* FilterContextBar

## 11.4 Shared data hooks

`src/features/*/hooks/`

Examples:

* `useCallsQuery`
* `useCallDetailQuery`
* `useSavedViews`
* `useImportBatchQuery`
* `useBillingSummary`
* `useIntegrationsHealth`

# 12. Recommended React/Tailwind app structure

This is the concrete file structure I recommend.

```text
/
├─ astro.config.ts
├─ netlify.toml
├─ package.json
├─ src/
│  ├─ env.d.ts
│  ├─ middleware.ts
│  ├─ layouts/
│  │  ├─ RootLayout.astro
│  │  ├─ AuthLayout.astro
│  │  └─ AppLayout.astro
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ login.astro
│  │  ├─ signup.astro
│  │  ├─ forgot-password.astro
│  │  ├─ reset-password.astro
│  │  ├─ invite/
│  │  │  └─ accept.astro
│  │  └─ app/
│  │     ├─ index.astro
│  │     ├─ overview.astro
│  │     ├─ calls/
│  │     │  ├─ index.astro
│  │     │  └─ [callId].astro
│  │     ├─ imports/
│  │     │  ├─ index.astro
│  │     │  └─ [batchId].astro
│  │     ├─ integrations.astro
│  │     ├─ reports.astro
│  │     ├─ billing.astro
│  │     ├─ ai.astro
│  │     ├─ updates.astro
│  │     └─ settings/
│  │        ├─ profile.astro
│  │        ├─ team.astro
│  │        ├─ alerts.astro
│  │        ├─ organization.astro
│  │        └─ api.astro
│  ├─ components/
│  │  ├─ ui/
│  │  ├─ app-shell/
│  │  └─ shared/
│  ├─ features/
│  │  ├─ calls/
│  │  ├─ imports/
│  │  ├─ integrations/
│  │  ├─ reports/
│  │  ├─ billing/
│  │  ├─ settings/
│  │  └─ ai/
│  ├─ lib/
│  │  ├─ auth/
│  │  │  ├─ server.ts
│  │  │  ├─ client.ts
│  │  │  └─ guards.ts
│  │  ├─ supabase/
│  │  │  ├─ browser-client.ts
│  │  │  ├─ server-client.ts
│  │  │  ├─ admin-client.ts
│  │  │  └─ types.ts
│  │  ├─ stripe/
│  │  │  ├─ server.ts
│  │  │  ├─ checkout.ts
│  │  │  └─ portal.ts
│  │  ├─ db/
│  │  │  ├─ queries/
│  │  │  ├─ mutations/
│  │  │  ├─ mappers/
│  │  │  └─ rpc.ts
│  │  ├─ validation/
│  │  │  ├─ calls.ts
│  │  │  ├─ imports.ts
│  │  │  ├─ billing.ts
│  │  │  └─ settings.ts
│  │  ├─ utils/
│  │  └─ constants/
│  ├─ server/
│  │  ├─ loaders/
│  │  ├─ actions/
│  │  ├─ permissions/
│  │  ├─ audit/
│  │  └─ jobs/
│  ├─ styles/
│  │  ├─ globals.css
│  │  ├─ tokens.css
│  │  └─ utilities.css
│  └─ types/
│     ├─ domain.ts
│     ├─ ui.ts
│     └─ api.ts
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql
│  └─ types.ts
└─ netlify/
   └─ functions/
      ├─ stripe-webhook.ts
      ├─ import-dispatch.ts
      ├─ integration-ingest.ts
      └─ alert-dispatch.ts
```

# 13. Why this structure fits the starter

The starter is intentionally minimal: a single Astro page, a small layout, and a simple Supabase client helper.

So the correct evolution is:

* keep Astro for route shell
* add React where interactivity is heavy
* split server and browser Supabase clients
* move feature complexity into `src/features/*`
* isolate backend logic in `src/server/*` and Netlify functions

Do not let business logic leak into random page files.

# 14. Server/client boundary rules

## Browser

Allowed:

* UI rendering
* optimistic state
* lightweight authenticated reads through approved query layer

Not allowed:

* Stripe secret actions
* service-role DB access
* privileged org-wide mutations without server handler

## Astro SSR/server

Allowed:

* route auth checks
* initial page data loading
* safe org-scoped reads
* server actions with permission checks

## Netlify functions

Use for:

* Stripe webhooks
* ingestion endpoints
* batch processors
* alert dispatch
* privileged mutations using service role

# 15. Stripe architecture

## 15.1 Stripe objects to use

* Customer
* PaymentMethod
* Checkout Session or Setup Intent
* Subscription if you add recurring platform fee
* Customer Portal
* Payment Intents for recharge/top-up

## 15.2 Recommended billing model

Use a hybrid model:

* platform subscription fee optional
* prepaid wallet for usage
* auto-recharge threshold + amount
* usage debits against wallet ledger

## 15.3 Local billing state

Store only what the app needs:

* Stripe IDs
* recharge settings
* wallet ledger
* invoice metadata cache
* portal eligibility

Never treat Stripe as the only source of app billing truth.

Your app needs its own usage ledger.

## 15.4 Stripe webhook events to handle

* customer.created
* payment_method.attached
* invoice.paid
* invoice.payment_failed
* customer.subscription.created
* customer.subscription.updated
* customer.subscription.deleted
* payment_intent.succeeded
* payment_intent.payment_failed

Each webhook should:

* verify signature
* write idempotently
* emit audit log
* update billing summary cache

# 16. Supabase Storage plan

Use Storage buckets:

* `imports/`
* `recordings/`
* `exports/`

Rules:

* import files private
* recordings private
* exports signed and time-limited
* no public bucket access for sensitive assets

# 17. Search and filter architecture

## 17.1 Filter model

Represent every filter as URL state.

Example:

* date_range
* publisher_ids
* campaign_ids
* disposition[]
* flag_type[]
* review_status
* search
* source_provider
* import_batch_id

This gives:

* shareable links
* saved views
* deterministic reports
* back/forward support

## 17.2 Search implementation

Use Postgres FTS first.

Search targets:

* transcript text
* caller number
* campaign name
* publisher name
* flag titles
* summary text

Use weighted ranking so exact caller/campaign matches outrank transcript matches.

# 18. Design system direction

## 18.1 Tone

This should feel:

* precise
* operational
* calm
* trustworthy
* serious
* fast

Not:

* playful
* overly neon
* generic SaaS gradient mush

## 18.2 Visual system

* dark mode primary
* light mode optional later
* strong semantic tokens
* dense but readable tables
* restrained accent color usage
* high-contrast statuses

## 18.3 Typography

* Inter or Geist
* tighter headings
* slightly condensed table headers
* mono only for IDs/timestamps if useful

## 18.4 Spacing

Use 8px base scale.

## 18.5 Density modes

Calls table should support:

* comfortable
* compact

Power users will want compact mode.

## 18.6 Badge system

Badges must be systematic:

* disposition badges
* flag severity badges
* review state badges
* integration health badges

Never invent random colors page by page.

# 19. High-risk UX failures to avoid

These will ruin trust if mishandled.

## 19.1 Hidden destructive behavior

Never let imports silently overwrite calls.

## 19.2 Ambiguous source of truth

Never blur raw source data with manual overrides.

## 19.3 No audit trail

Never allow review changes without provenance.

## 19.4 Weak bulk workflows

Power users must be able to handle many records quickly.

## 19.5 Generic table only

The main table must lead naturally into evidence and action.

## 19.6 Billing opacity

Do not show balance without showing how it changes.

# 20. Key product improvements over the current app

These are the biggest upgrades from the current screenshots.

## 20.1 First-class import management

Current product has import entry. Rebuild adds:

* validation
* preview
* batch details
* row errors
* rollback path
* provenance links

## 20.2 Call detail drawer/page

Current product implies row clicks, but the rebuild makes detail inspection central.

## 20.3 Manual override system

You specifically called out frustration with uneditable bad imports. Rebuild adds:

* manual disposition override
* review notes
* audit history
* source preservation

## 20.4 Saved views

Heavy operators need persistent filtered workflows.

## 20.5 Stronger alerts

From simple email settings to real operational routing.

## 20.6 Better integration health

Move from “connected/reconfigure” to “connection observability.”

# 21. Build order

This is the implementation sequence I would use.

## Phase 1: Foundation

* add React integration to Astro
* auth shell
* organizations and memberships
* base layout and nav
* design system primitives
* server/browser Supabase clients

## Phase 2: Core data

* calls schema
* imports schema
* publishers/campaigns
* audit log
* saved views
* transcript storage

## Phase 3: Calls experience

* calls table
* filters
* drawer
* detail page
* review workflow
* overrides
* exports

## Phase 4: Imports

* upload flow
* validation
* batch detail
* row errors
* processing jobs

## Phase 5: Integrations

* provider config
* health view
* event log
* test endpoints

## Phase 6: Billing

* Stripe setup
* customer sync
* recharge settings
* wallet ledger
* invoice history

## Phase 7: Reports and alerts

* dashboards
* alert rules
* notification logging
* summaries

## Phase 8: Ask AI

* grounded data assistant
* linked results
* permission-bound query actions

# 22. Concrete changes needed in the starter repo

Because the current starter is intentionally tiny, these are the first repo-level changes I would make after cloning it:

1. Add React integration to Astro.
2. Replace the demo `index.astro` with app redirect/auth landing.
3. Replace the single demo layout with `RootLayout`, `AuthLayout`, and `AppLayout`.
4. Replace `src/utils/database.ts` with:

   * `browser-client.ts`
   * `server-client.ts`
   * `admin-client.ts`
5. Add `src/middleware.ts` for auth/session enforcement.
6. Add `src/features/*` structure.
7. Add typed query/mutation layer.
8. Add Netlify functions for Stripe and ingestion.
9. Add Supabase migrations for all app tables.
10. Add seed data for local QA workflows.

The current starter’s simplicity is good; it means you are not fighting legacy structure.

# 23. Final opinionated recommendation

The single most important architectural choice in this rebuild is this:

Treat imports, calls, analyses, and reviews as separate but linked objects.

That is what transforms the app from:
“a dashboard that displays AI labels”

into:
“an auditable operations system for making money-critical decisions.”

That is the line between a demo and a product.

# 24. What success looks like

When this is built correctly:

* a buyer ops lead can identify bad traffic in minutes
* a reviewer can verify and override AI safely
* a manager can trust the trend lines
* a finance owner can understand exactly why balance moved
* an engineer can debug ingestion without guessing
* and nobody has to wonder where a classification came from

That is the standard this blueprint is aiming at.

The best next step is for me to turn this into a **build-ready implementation pack** with:

* exact Supabase SQL migrations
* RLS policies
* route-by-route Astro page stubs
* React component scaffolds
* and the initial Stripe + Netlify function contracts.
