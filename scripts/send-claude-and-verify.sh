#!/usr/bin/env bash
set -euo pipefail

TARGET="${CLAUDE_TMUX_TARGET:-dependableqa-overnight:0.0}"
PROMPT_LOG="${CLAUDE_PROMPT_LOG:-docs/product/overnight-prompts-2026-06-01.md}"
CURRENT_PROMPT_FILE="${CLAUDE_CURRENT_PROMPT_FILE:-docs/product/claude-current-prompt.md}"
STATUS_FILE="${CLAUDE_STATUS_FILE:-docs/product/overnight-status.md}"
WAIT_SECONDS="${CLAUDE_VERIFY_WAIT_SECONDS:-20}"
SUBMIT_KEY="${CLAUDE_SUBMIT_KEY:-S-Enter}"
PRINT_FALLBACK_LOG="${CLAUDE_PRINT_FALLBACK_LOG:-docs/product/overnight-claude-print.log}"
PRINT_FALLBACK="${CLAUDE_PRINT_FALLBACK:-1}"

usage() {
  printf 'Usage: %s [--target tmux-target] [--wait seconds] [prompt]\n' "$0"
  printf 'Reads prompt from arguments or stdin, sends it to Claude in tmux, and verifies fresh activity.\n'
  printf 'If tmux submission is not verified, CLAUDE_PRINT_FALLBACK=1 runs the same prompt with claude -p.\n'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --wait)
      WAIT_SECONDS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -gt 0 ]; then
  PROMPT="$*"
else
  PROMPT="$(cat)"
fi

if [ -z "${PROMPT//[[:space:]]/}" ]; then
  printf 'No prompt provided.\n' >&2
  exit 2
fi

if ! tmux has-session -t "${TARGET%%:*}" 2>/dev/null; then
  printf 'tmux session not found for target: %s\n' "$TARGET" >&2
  exit 2
fi

mkdir -p "$(dirname "$PROMPT_LOG")"
mkdir -p "$(dirname "$CURRENT_PROMPT_FILE")"
NOW="$(date '+%Y-%m-%d %H:%M:%S %Z')"

{
  printf '\n## %s\n\n' "$NOW"
  printf 'Target: `%s`\n\n' "$TARGET"
  printf '```text\n%s\n```\n' "$PROMPT"
} >> "$PROMPT_LOG"

{
  printf '# Current Claude Prompt\n\n'
  printf 'Created: %s\n\n' "$NOW"
  printf 'Target: `%s`\n\n' "$TARGET"
  printf '## Prompt\n\n'
  printf '%s\n' "$PROMPT"
} > "$CURRENT_PROMPT_FILE"

SEND_LINE="Read and execute the prompt in ${CURRENT_PROMPT_FILE}. Follow it exactly, then report back with the requested final summary."
BEFORE="$(tmux capture-pane -pt "$TARGET" -S -120)"

# Send a short one-line instruction. Claude's TUI can leave large multiline
# pastes sitting in the composer; a file-backed prompt avoids that failure mode.
# Do not send C-c here: in Claude's TUI it can revive an older draft from the
# composer history instead of clearing the current input.
tmux send-keys -t "$TARGET" C-u
tmux send-keys -t "$TARGET" -l -- "$SEND_LINE"
sleep "${CLAUDE_SUBMIT_DELAY_SECONDS:-1}"
tmux send-keys -t "$TARGET" "$SUBMIT_KEY"

DEADLINE=$(( $(date +%s) + WAIT_SECONDS ))
VERIFIED="no"
AFTER=""

while [ "$(date +%s)" -le "$DEADLINE" ]; do
  sleep 1
  AFTER="$(tmux capture-pane -pt "$TARGET" -S -120)"

  if [ "$AFTER" != "$BEFORE" ]; then
    case "$AFTER" in
      *"❯ ${SEND_LINE}"*|*"❯ ${SEND_LINE}"*)
        continue
        ;;
    esac

    case "$AFTER" in
      *"⏺"*|*"Running"*|*"I'll"*|*"I’ll"*|*"Thinking"*|*"Tool use"*|*"Interrupted"*)
        VERIFIED="yes"
        break
        ;;
    esac
  fi
done

write_status() {
  local delivery="$1"
  local result="$2"

  {
    printf '# Overnight Status\n\n'
    printf 'Updated: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
    printf 'tmux target: `%s`\n\n' "$TARGET"
    printf 'Prompt delivery: `%s`\n\n' "$delivery"
    printf 'Last prompt verification: `%s`\n\n' "$result"
    printf 'Last prompt log: `%s`\n\n' "$PROMPT_LOG"
    printf 'Current prompt file: `%s`\n\n' "$CURRENT_PROMPT_FILE"
    printf 'Print fallback log: `%s`\n\n' "$PRINT_FALLBACK_LOG"
    printf 'Sent line: `%s`\n\n' "$SEND_LINE"
    printf '## Last Prompt\n\n'
    printf '```text\n%s\n```\n\n' "$PROMPT"
    printf '## Latest Pane Tail\n\n'
    printf '```text\n%s\n```\n' "$(tmux capture-pane -pt "$TARGET" -S -50 | tail -40)"
  } > "$STATUS_FILE"
}

write_status "tmux" "$VERIFIED"

if [ "$VERIFIED" != "yes" ]; then
  if [ "$PRINT_FALLBACK" = "1" ]; then
    mkdir -p "$(dirname "$PRINT_FALLBACK_LOG")"
    {
      printf '\n## %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
      printf 'tmux verification failed after %s seconds. Running claude -p fallback.\n\n' "$WAIT_SECONDS"
      printf '```text\n'
    } >> "$PRINT_FALLBACK_LOG"

    if claude -p --permission-mode auto --effort xhigh "$PROMPT" >> "$PRINT_FALLBACK_LOG" 2>&1; then
      printf '```\n' >> "$PRINT_FALLBACK_LOG"
      write_status "print-fallback" "yes"
      printf 'Prompt sent through claude -p fallback at %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
      exit 0
    fi

    printf '```\n' >> "$PRINT_FALLBACK_LOG"
    write_status "print-fallback" "no"
    printf 'Prompt was not verified in tmux and claude -p fallback failed.\n' >&2
    printf 'Check: %s and tmux attach -t %s\n' "$PRINT_FALLBACK_LOG" "${TARGET%%:*}" >&2
    exit 1
  fi

  printf 'Prompt sent, but fresh Claude activity was not verified within %s seconds.\n' "$WAIT_SECONDS" >&2
  printf 'Check: tmux attach -t %s\n' "${TARGET%%:*}" >&2
  exit 1
fi

printf 'Prompt sent and verified active at %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
