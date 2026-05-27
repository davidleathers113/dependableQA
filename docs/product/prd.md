# Product Requirements Document: DependableQA Call Review Workspace

## 1. Product Summary
DependableQA requires a specialized call review workspace where reviewers can listen to recordings, follow synchronized transcripts, jump to specific moments, flag issues, and complete quality assessments with high efficiency.

This page is a **call investigation and QA workspace**, not a standard media player.

## 2. Product Goal
Enable reviewers to answer four core questions rapidly:
* What happened?
* Where did it happen?
* Is it a problem?
* What should happen next?

## 3. Success Criteria
* **Speed:** Start playback within 1 second of page load.
* **Precision:** Click any transcript segment to jump to that exact timestamp.
* **Automation:** Transcript follows playback automatically with toggleable auto-follow.
* **Efficiency:** Search transcript and navigate between matches instantly.
* **Accuracy:** Flag exact moments for review in under 3 seconds.
* **Retention:** Save final review decisions without page reloads.

## 4. Primary Users
* **Reviewer:** Conducts quality, compliance, and operational audits.
* **Manager:** Audits flagged moments, resolves escalations, and validates decisions.
* **Operator:** Investigates specific call outcomes without full relistening.

## 5. Core Product Principles
* **Transcript First:** The transcript is the primary interaction canvas.
* **Time-Anchored:** All data (segments, regions, notes, flags, AI insights) is tied to the timeline.
* **User Intent:** Auto-scroll and playback sync must be easily overridable.
* **Immediate Action:** Flagging and note-taking must be available in-context.
* **Calm UX:** Minimalist design focused on utility and precision.

## 6. Scope

### In Scope
* Audio playback with speed controls.
* Synchronized, clickable transcript.
* Full-text transcript search.
* Waveform visualization with click-to-seek.
* Time-anchored flagging and notes.
* AI summary and suggested moments panel.
* Final review disposition and summary workflow.
* Deep linking to timestamps and specific flags.
* Full keyboard accessibility.
* Mobile-responsive review mode.

### Out of Scope (V1)
* Collaborative live cursors.
* Threaded team comments.
* Inline transcript editing.
* Advanced analytics dashboards.

## 7. User Stories

### Playback & Navigation
* As a reviewer, I want to jump to any transcript line so I can investigate specific segments quickly.
* As a reviewer, I want the transcript to auto-scroll during playback so I can follow along effortlessly.
* As a reviewer, I want to disable auto-follow when I scroll manually so I can read other parts of the call without interruptions.
* As a reviewer, I want to search keywords and jump between hits so I can find specific topics instantly.

### Flagging & Notes
* As a reviewer, I want to flag a range of time so I can mark compliance or quality issues.
* As a reviewer, I want flags to appear in the waveform and transcript so I have a visual map of the call.
* As a reviewer, I want to add notes at specific timestamps so my observations are anchored to the evidence.

### Decision Support
* As a reviewer, I want to see an AI-generated summary so I can orient myself before listening.
* As a reviewer, I want a list of unresolved flags so I know where my attention is required.
* As a manager, I want to open a flag directly from a link so I can audit it without hunting through the call.

## 8. Experience Definition

### Desktop Layout
* **Header:** Title, metadata, search, playback controls, speed, and follow-toggle.
* **Main Workspace:** Waveform strip (top) and Transcript pane (center).
* **Left Rail:** Queue navigation, filters, and jump-to-moment list.
* **Right Rail:** AI summary, active flags, notes, and final decision form.

### Mobile Layout
* Sticky mini-player.
* Tabbed view: Transcript / Flags / AI.
* Bottom action bar for quick flagging and notes.

## 9. Functional Requirements

### 9.1 Audio Playback
* Support Play, Pause, Seek, -5s Rewind, +10s Forward.
* Display current time and total duration.
* Variable playback speed (0.5x to 2.0x).

### 9.2 Transcript & Sync
* Render timed segments with speaker labels.
* Highlight the active segment during playback.
* Auto-scroll active segment into view (unless auto-follow is disabled).
* Provide "Jump to Playback" affordance when auto-follow is paused.

### 9.3 Search
* Full-text search with hit highlighting.
* Previous/Next navigation through hits.
* Selecting a hit seeks playback to that segment.

### 9.4 Waveform
* Render waveform overview with playhead and progress fill.
* Display flagged regions as interactive overlays.
* Support click-to-seek and optional minimap for long calls.

### 9.5 Flagging & Notes
* Create flags from transcript lines, text selection, or current playback time.
* Flags include: Category, Severity, Note, and Status (Open/Resolved).
* Replay flags from -3s pre-roll.
* Create and view timestamp-linked notes.

### 9.6 AI Analysis
* Render summary, suggested disposition, and key moments.
* Clickable AI moments jump to specific timestamps.

### 9.7 Decision Workflow
* Capture final Disposition, Compliance Status, and Reviewer Summary.
* Save result without leaving the workspace.

### 9.8 Deep Linking
* Support `?t=seconds` for timestamp sharing.
* Support sharing specific flag IDs via URL.

## 10. Non-Functional Requirements
* **Performance:** Transcript visible < 1s; seeks < 100ms.
* **Accessibility:** WCAG 2.2 compliant (keyboard navigation, focus states, aria-labels).
* **Reliability:** Graceful fallbacks for missing audio or missing transcripts.

## 11. Technical Implementation
* **Source of Truth:** Native `<audio>` element for all timing.
* **Transcript Model:** Timed segments with start/end offsets.
* **Waveform:** Wavesurfer.js for visualization and region management.
* **State Management:** React-based orchestration of playback and UI sync.

## 12. Keyboard Map
* `Space`: Play/Pause
* `Left/Right`: Seek short interval
* `Shift + Left/Right`: Seek large interval
* `/`: Focus search
* `f`: Create flag
* `n`: Add note
* `[` / `]`: Prev/Next flag

## 13. Data Models

### Transcript Segment
```ts
type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
}
```

### Flag
```ts
type Flag = {
  id: string;
  start: number;
  end: number;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  note: string;
  status: "open" | "resolved";
}
```

## 14. Acceptance Criteria
1. Audio seeks correctly when clicking transcript or waveform.
2. Transcript auto-scrolls and highlights the correct segment.
3. Search highlights all matches and allows navigation.
4. Flags can be created and saved without page reload.
5. All controls are accessible via keyboard.
6. Deep links restore the correct time and active flag.
