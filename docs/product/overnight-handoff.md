# DependableQA Overnight Handoff

Last updated: 2026-06-01 22:59 EDT

## Current Runtime

- Repo: `/Users/davidleathers/dependableQA`
- Claude tmux session: `dependableqa-overnight`
- Claude tmux target: `dependableqa-overnight:0.0`
- Current prompt file: `docs/product/claude-current-prompt.md`
- Prompt log: `docs/product/overnight-prompts-2026-06-01.md`
- Status file: `docs/product/overnight-status.md`
- Execution brief: `docs/product/overnight-execution-2026-06-01.md`
- Timestamped tmux log: `logs/dependableqa-overnight.tmux.log`
- Send helper: `scripts/send-claude-and-verify.sh`

## Current Active Claude Task

Claude completed the pre-existing Playwright failure:

`transcript search finds matches`

It was an e2e hydration race, not a product search bug. Validation is green:
focused Vitest 7/7, focused Playwright 3/3, full Playwright 14/14, and
`npm run ci:verify` passed with 64 files / 420 tests.

Claude also completed the wallet-accurate analyze estimate follow-up. Calls-list and Ringba
import estimates now use the org per-minute rate × billable duration instead of the flat
`~$0.03/call` placeholder. Validation: focused Vitest 14/14, `npm run ci:verify` green
(64 files / 424 tests), and full Playwright 14/14. No staged files or commits.

Claude also completed the pre-traffic integration diagnostics follow-up. Configured
integrations with zero events now show practical no-traffic guidance, a verify-now action, and
provider-accurate expectations for the first call/webhook. Validation: focused Vitest 28/28
and `npm run ci:verify` green (65 files / 430 tests). No staged files or commits.

Next recommended task: make the Diagnostics "Verify before live traffic" callout actionable by
threading tab navigation into `IntegrationDiagnosticsPanel`, so the callout can jump directly
to API sync, Security, Pixel, etc.

## How To Resume From A Fresh Session

1. Start in the repo:

   ```bash
   cd /Users/davidleathers/dependableQA
   ```

2. Read:

   ```bash
   sed -n '1,220p' AGENTS.md
   sed -n '1,260p' docs/product/overnight-execution-2026-06-01.md
   sed -n '1,220p' docs/product/overnight-status.md
   tail -120 docs/product/overnight-prompts-2026-06-01.md
   ```

3. Inspect Claude:

   ```bash
   tmux capture-pane -pt dependableqa-overnight:0.0 -S -120 | tail -80
   tail -120 logs/dependableqa-overnight.tmux.log
   ```

4. If Claude is active, keep monitoring.

5. If Claude is idle and has completed the current task, inspect the diff and tests:

   ```bash
   git status --short
   git diff --stat
   ```

6. Send the next Level 2 prompt with:

   ```bash
   scripts/send-claude-and-verify.sh <<'PROMPT'
   <write the next Level 2 prompt here>
   PROMPT
   ```

## Rules

- Do not commit, push, deploy, install software, or change production settings.
- Use Level 2 prompts only.
- Do not treat a prompt as sent unless `scripts/send-claude-and-verify.sh` reports verification.
- Keep `docs/product/overnight-status.md` and the execution log current.
- Preserve David's uncommitted changes; never revert unrelated work.
