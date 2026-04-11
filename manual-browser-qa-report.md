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

Second write-flow pass complete. Findings are appended below.

## Second-Pass Scope

The second pass exercised seeded write flows, focusing on:

- Saved view creation from the calls list
- Review-state mutations on full call detail pages
- Review-note save behavior
- Flag status mutations on the flagged call
- Disposition override readiness and submission behavior

## Second-Pass Findings

### 4. High: saved-view creation is not actionable from the calls page

Attempted flow:

- Navigate to `/app/calls`
- Enter `QA Mutation View` into the saved-view name field
- Blur the field and re-check button state

Observed behavior:

- The text field accepted the value.
- `Save View` remained disabled throughout the interaction.
- No save request was fired.

Impact:

- Users cannot create saved views from the current list UI.

### 5. High: review and flag mutations succeed, but the full detail UI often stays stale

I exercised state-changing actions on both seeded calls:

- On flagged call `6fca0096-d281-4a3f-b56f-7cc7ba9fa78b`
  - `Reopen Review` returned `200`
  - `Dismiss Flag` returned `200`
- On in-review call `3707afb1-2b63-44eb-86c0-6dc67e5afd84`
  - `Confirm Disposition` returned `200`

Database verification confirmed those writes persisted:

- Flagged call moved to `current_review_status = reopened`
- Its only flag moved to `status = dismissed`
- In-review call moved to `current_review_status = reviewed`

Observed UI behavior:

- After successful POSTs, the page often continued showing the pre-mutation state or a partially stale state.
- Example: after `Reopen Review`, the flagged call detail page still showed `reviewed` in the visible review summary until a later refresh cycle.
- Example: the calls query used by detail refresh kept returning `406`, while sibling review/flag/audit queries succeeded.

Impact:

- Mutations are landing in the database, but operators cannot trust the page to reflect what just happened.
- This is especially risky for QA/review workflows because users may retry actions or assume they failed.

### 6. Medium: review-note saves persist, but the action flow is confusing and easy to double-submit

Attempted flow on call `3707afb1-2b63-44eb-86c0-6dc67e5afd84`:

- Fill review note with `QA pass note for seeded call`
- Click `Save Review Note`

Observed behavior:

- The note save did persist to the database.
- Multiple saved review rows were created while testing the flow.
- The UI provided weak feedback about whether the save had actually completed.
- After adjacent mutations, action buttons frequently entered a disabled-looking state that made follow-up actions ambiguous.

Database verification confirmed the note text persisted in new `call_reviews` rows.

Impact:

- The write itself works.
- The surrounding UX makes it easy to generate duplicate audit entries or repeat saves because the UI does not clearly settle into a trustworthy post-save state.

### 7. Medium: disposition override could not be completed after successful prior mutations

Attempted flow on call `3707afb1-2b63-44eb-86c0-6dc67e5afd84`:

- Fill `Override disposition` with `Qualified`
- Fill reason with `QA override validation`

Observed behavior:

- The fields accepted values.
- At one point the override control became actionable immediately after a multi-field fill.
- After subsequent review mutations, the same section repeatedly ended up disabled-looking or non-actionable even with both values populated.
- No disposition override POST was observed.
- Database verification showed no new `disposition_overrides` row for the call.

Impact:

- I could not complete the override path reliably in the browser.
- This appears tied to the same stale/pending detail-page state that affects other post-mutation interactions.

## Second-Pass Data Verification

I verified the seeded workspace directly after the browser pass:

- Call `6fca0096-d281-4a3f-b56f-7cc7ba9fa78b`
  - `current_review_status` became `reopened`
  - flag `Verify compliance disclosure` became `dismissed`
- Call `3707afb1-2b63-44eb-86c0-6dc67e5afd84`
  - `current_review_status` became `reviewed`
  - new review rows were created with note text `QA pass note for seeded call`
  - no disposition override row was created

## Overall Summary

The second pass changed my confidence profile:

- Backend review and flag write endpoints are not dead; they do persist seeded changes.
- The calls UX still has serious operational issues because list-level and detail-level state do not reliably stay in sync with those successful writes.
- The drawer remains broken.
- Saved-view creation remains blocked.
- Some form-based detail actions become unreliable or visually stale after preceding mutations.
