# DependableQA Call Review Workspace Feature Spec

## Core Principle
**The transcript is the product.**
Playback, waveform, flags, AI review, and notes orbit around it.

## Product Vision
A reviewer should be able to answer these questions in under 30 seconds:
* What happened?
* Where did it happen?
* Is it a problem?
* What do I do next?

The workspace should be:
* **Calm:** Minimal distractions.
* **Fast:** Immediate response to interactions.
* **Precise:** Exact alignment between audio and text.
* **Trustworthy:** Transparent data and AI reasoning.
* **Controllable:** Keyboard-first navigation and playback.

---

## North Star UX
A reviewer lands on a call and immediately identifies:
1. Identity of the call (Source/Campaign).
2. Current playback position.
3. Corresponding transcript segment.
4. Existing flags and AI insights.
5. Required actions or judgments.

The UI supports both **Passive listening** and **Active investigation** without mode-switching.

---

## Desktop Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                                       │
│ Call: Roofing Lead - Ringba / Alpha Campaign     12:43 PM · 08m 14s · 2 speakers            │
│ Status: Needs Review    Outcome: Unresolved      Search transcript [_____________]           │
│ [Play] [Pause] [-5s] [+10s] 1.0x  Volume  Follow Playback [On]  [Copy link] [Share]        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────┬───────────────────────────────────────────────┐
│ LEFT SIDEBAR                                 │ MAIN WORKSPACE                                │
│                                              │                                               │
│ Queue / Navigation                           │ WAVEFORM + TIMELINE                           │
│ • Back to call list                          │ ┌───────────────────────────────────────────┐ │
│ • Prev flagged call                          │ │ waveform                                  │ │
│ • Next flagged call                          │ │ flagged regions / playhead / minimap     │ │
│                                              │ └───────────────────────────────────────────┘ │
│ Filters                                      │                                               │
│ [ ] Flags only                               │ TRANSCRIPT                                    │
│ [ ] AI risk only                             │ ┌───────────────────────────────────────────┐ │
│ [ ] Low-confidence only                      │ │ 00:00 Agent: Thanks for calling...       │ │
│ [ ] Caller only                              │ │ 00:03 Caller: Yeah, I need...            │ │
│ [ ] Agent only                               │ │ 00:08 Agent: Let me ask...               │ │
│                                              │ │                                           │ │
│ Jump list                                    │ │ Active line highlighted                   │ │
│ • AI summary moment 1                        │ │ Click line to seek                        │ │
│ • AI summary moment 2                        │ │ Hover actions: flag / note / copy link   │ │
│ • Flag #1                                    │ │ Text selection creates review range       │ │
│ • Flag #2                                    │ └───────────────────────────────────────────┘ │
└──────────────────────────────────────────────┴───────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ RIGHT REVIEW RAIL                                                                            │
│                                                                                              │
│ AI Summary                                                                                   │
│ - Qualified lead, asked about timeline, possible pricing objection                           │
│                                                                                              │
│ Review Actions                                                                               │
│ [Mark Reviewed] [Needs Escalation] [Compliant] [Assign]                                     │
│                                                                                              │
│ FLAGS                                                                                        │
│ #1 Pricing objection      02:14 - 02:46     High     [Jump] [Replay] [Resolve]             │
│ #2 Missing disclosure     04:01 - 04:19     Critical [Jump] [Replay] [Resolve]             │
│                                                                                              │
│ NOTES                                                                                        │
│ + Add note                                                                                   │
│                                                                                              │
│ FINAL DECISION                                                                               │
│ Disposition [dropdown]                                                                       │
│ Severity [dropdown]                                                                          │
│ Reviewer summary [textarea]                                                                  │
│ [Save Review]                                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Mobile Wireframe

```text
┌──────────────────────────────┐
│ Call title + status          │
│ Search icon  Filters icon    │
├──────────────────────────────┤
│ Sticky mini-player           │
│ [Play] 00:31 / 08:14 1.0x    │
│ scrubber                     │
├──────────────────────────────┤
│ Tabs: Transcript | Flags | AI│
├──────────────────────────────┤
│ Transcript tab               │
│ 00:28 Agent: ...             │
│ 00:31 Caller: ...            │
│ active line centered         │
│ tap line = seek              │
│ long press = flag            │
├──────────────────────────────┤
│ Bottom action bar            │
│ [Flag moment] [Add note]     │
│ [Mark reviewed]              │
└──────────────────────────────┘
```

---

## Information Architecture

### 1. Header Rail
* **Identity:** Call title, provider, campaign, timestamp, duration, speaker count.
* **Global Controls:** Playback status, speed selector (0.75x to 2.0x), transcript search, follow-playback toggle, deep-link sharing.

### 2. Waveform Strip
* **Visuals:** Waveform, playhead, flagged regions as overlays, timeline labels.
* **Interactions:** Hover time tooltip, click-to-seek, minimap for long calls.

### 3. Transcript Pane
* **Elements:** Timestamped segments, speaker labels, confidence markers.
* **Contextual Actions:** Segment hover actions (flag, note, copy link), text selection to create review ranges.
* **States:** Active segment highlighting, auto-scroll management.

### 4. Review Rail
* **AI Insights:** Automated summary, suggested disposition, predicted outcome.
* **Management:** Flag list (unresolved first), notes, assignments, final review submission.

### 5. Navigation Rail
* **Workflow:** Back to list, prev/next flagged call in queue, jump links to key moments, view filters.

---

## Core Interaction Model

### A. Playback ↔ Transcript Sync
* **Seeking:** Clicking a transcript segment seeks audio to that start time.
* **Tracking:** Active transcript line updates automatically as playback progresses.
* **Follow Mode:** Transcript auto-scrolls to keep the active segment visible.
* **Override:** Manual scroll pauses auto-follow; a "Jump back to live" button restores it.

### B. Transcript Search
* Keyword matching with hit highlighting.
* Previous/Next navigation through results.
* Jump to selected search result in both transcript and playback.

### C. Waveform Interaction
* **Scrubbing:** Click or drag on waveform to navigate.
* **Region Visualization:** Flags appear as colored overlays.
* **Drill-down:** Clicking a flagged region focuses the corresponding card in the Review Rail.

### D. Flagging
* **Triggers:** Transcript hover, text selection, waveform drag, or keyboard shortcut (`f`).
* **Metadata:** Category, severity, start/end timestamps, associated segment IDs, notes, and creator.
* **Resolution:** Flags can be marked "Resolved" without deleting the underlying timestamped evidence.

---

## Concrete Feature Spec

### 1. Sticky Player Controls
* Play/Pause, -5s Back, +10s Forward.
* Current time / total duration.
* Volume/Mute.
* Persistent playback speed selection.

### 2. Transcript Pane Details
* **Inline Actions:** Add flag/note directly at a segment.
* **Filtering:** View by Speaker (Agent/Caller), Flags only, AI risks only.
* **Navigation:** Click timestamp to seek; scroll remains smooth.

### 3. Review Workflow
* **AI Summary:** Concise overview of the call's purpose and outcome.
* **Flag Actions:** Replay from -3s before flag start; Loop region.
* **Decision Panel:** Dropdowns for Disposition and Severity; Textarea for final Reviewer Summary.

---

## Accessibility Spec

* **Keyboard Access:** Full control for playback (Space, Arrows), Search (`/`), Flagging (`f`), and Navigation.
* **Visual States:** High-contrast focus states and active line markers.
* **Screen Readers:** Semantic speaker labels and accessible transcript text.
* **Motion:** Reduced motion mode to disable animated auto-scrolling.

---

## Performance Spec

* **Interactivity:** Page shell interactive in <2s.
* **Rendering:** Transcript visible immediately; lazy-init for waveform and AI insights.
* **Responsiveness:** Playback controls and seeking responsive within 100ms.
* **Scalability:** Virtualized rendering for long call transcripts.

---

## Technical Implementation

### Media Engine
* Use native `<audio>` element as the single source of truth for `currentTime` and `duration`.
* Synchronize UI state via `timeupdate` and `ratechange` events.

### Data Model

```ts
type TranscriptSegment = {
  id: string
  start: number
  end: number
  speaker: string
  text: string
  confidence?: number
}

type Flag = {
  id: string
  start: number
  end: number
  category: "compliance" | "qualification" | "agent_quality" | "customer_intent" | "follow_up" | "operational"
  severity: "low" | "medium" | "high" | "critical"
  note: string
  status: "open" | "resolved"
}
```

### Components
* **React Shell:** Manages global state (playback, active segment, filters).
* **Wavesurfer.js:** Handles waveform rendering and region management.
* **Optimistic UI:** Immediate visual feedback for flag creation and status changes.

---

## Acceptance Criteria

1. Audio plays reliably across all supported browsers.
2. Transcript seeks to correct time on click and follows playback accurately.
3. User can create, edit, and resolve flags from transcript or waveform.
4. Search results correctly highlight and jump to segments.
5. All primary actions are accessible via keyboard.
6. AI summary and suggested moments render when analysis is available.
7. Deep links correctly restore playback position on page load.
