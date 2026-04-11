# Manual Browser QA Report

Date: 2026-04-10
Environment: local Netlify dev at `http://localhost:8892`
Tester: Cursor agent browser pass

## Scope

This report captures manual browser QA findings for the calls experience. The first pass focused on read-only verification across:

- Login and seeded workspace access
- Calls list initial load and visual state
- KPI cards and queue presets
- URL-backed filters and chips
- Calls row interaction and quick-review drawer
- Full detail page deep links and tab parity
- Browser console and network regressions

## Environment Notes

- `http://localhost:8891` was not usable for QA because Astro assets returned `404`, including the login island JS and CSS.
- A fresh Netlify dev instance on `http://localhost:8892` was used for the actual checks.
- A dedicated QA user was created and attached to the seeded demo org so the browser pass would not depend on an unknown existing user session.

## First-Pass Findings

### 1. High: quick-review drawer fails for a real call row

Clicking the visible `+15559876543` row on the calls page opened the drawer chrome, but the body rendered `Call details could not be loaded.` for that call.

Observed behavior:

- Drawer shell opened successfully.
- Drawer never populated the detail content.
- The same call loaded correctly when visited directly on the full detail page.
- Network requests for the drawer repeatedly returned `406` on the `calls` query for call ID `3707afb1-2b63-44eb-86c0-6dc67e5afd84`.

Impact:

- The primary in-list review workflow is unreliable.
- Users can deep-link into call detail, but cannot trust the faster drawer path.

### 2. High: `Flagged only` can wedge the calls page into a false empty state

Toggling `Flagged only` on and then back off caused the entire page state to collapse to zero rows and zero summary counts.

Observed behavior:

- Enabling `Flagged only` correctly narrowed the queue.
- Disabling it removed the visible chip but left the page in an empty state.
- Summary cards dropped to zero.
- Publisher, campaign, and disposition filter options collapsed to empty/default-only sets.
- Clicking the in-page `All Calls` preset did not restore the queue.
- Only navigating fresh to `/app/calls` restored the seeded data.

Impact:

- Users can get trapped in a broken-looking empty queue.
- In-page controls do not reliably recover the current queue state.

### 3. Low: React hydration mismatch logged on calls page load

The browser console reported a React hydration mismatch on the calls page.

Observed behavior:

- The mismatch appeared around active navigation styling for the `Calls` sidebar link.
- The page still rendered, but the console warning indicates server/client markup drift.

Impact:

- Low immediate user impact.
- Raises risk that more meaningful hydration regressions could be masked or misdiagnosed later.

## First-Pass Coverage

Verified:

- Login on healthy local environment
- Seeded workspace overview load
- Calls page render with seeded rows
- KPI summary cards
- Preset buttons
- URL-backed search filter
- Filter chip rendering
- Direct full detail pages for both seeded calls
- Transcript, flags, and audit tabs on the flagged call

Deferred to second pass:

- State-changing write flows
- Saved view creation/deletion
- Review mutations
- Flag status mutations
- Disposition override flows

## Status

Second write-flow pass pending. Findings from that pass will be appended below.
