#!/bin/bash
# agent-loop: run `claude --print` repeatedly with the same prompt file until the agent
# emits <promise>COMPLETE</promise>. Each iteration is a fresh context; state lives on disk
# (git, a tasks checklist, an append-only progress log).
set -eo pipefail

ITERATIONS=50
# Opus 5.5 full model ID (https://code.claude.com/docs/en/model-config). Requires Claude Code >= 2.1.280.
EXPECTED_MODEL="claude-opus-5-5"
PROMPT_FILE="agent-loop-prompt.md"
TASKS_FILE="TASKS.md"      # checklist of `- [ ]` / `- [x]` lines; used for stall detection when present
MAX_TURNS=80
STALL_LIMIT=3              # abort after this many consecutive iterations with no new [x]
REVIEW=true
ADD_DIRS=()

usage() {
  cat >&2 <<EOF
Usage: $(basename "$0") [options]
  --iterations N       max loop passes (default $ITERATIONS)
  --model MODEL        model to run and to assert on (default $EXPECTED_MODEL)
  --prompt FILE        prompt file re-sent every pass (default $PROMPT_FILE)
  --tasks FILE         checklist for stall detection (default $TASKS_FILE; skipped if absent)
  --max-turns N        per-pass turn budget (default $MAX_TURNS)
  --stall N            abort after N passes with no newly checked task (default $STALL_LIMIT)
  --add-dir PATH       extra working directory for claude (repeatable)
  --review|--no-review run /simplify after completion (default on)
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations)   ITERATIONS="$2"; shift 2 ;;
    --model)        EXPECTED_MODEL="$2"; shift 2 ;;
    --prompt)       PROMPT_FILE="$2"; shift 2 ;;
    --tasks)        TASKS_FILE="$2"; shift 2 ;;
    --max-turns)    MAX_TURNS="$2"; shift 2 ;;
    --stall)        STALL_LIMIT="$2"; shift 2 ;;
    --add-dir)      ADD_DIRS+=("$2"); shift 2 ;;
    --review)       REVIEW=true; shift ;;
    --no-review)    REVIEW=false; shift ;;
    *) usage ;;
  esac
done

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Prompt file '$PROMPT_FILE' not found." >&2
  exit 1
fi

CLAUDE_ARGS=()
for d in "${ADD_DIRS[@]}"; do CLAUDE_ARGS+=(--add-dir "$d"); done

# The API reports the base model even when a context suffix like `[1m]` was requested.
MODEL_BASE="${EXPECTED_MODEL%%\[*}"

# jq filters
JQ_STREAM='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'
JQ_RESULT='select(.type == "result").result // empty'
JQ_MODEL='[select(.type == "assistant").message.model] | first // empty'

TMPFILES=()
trap 'rm -f "${TMPFILES[@]}"' EXIT

# Run a claude session, streaming output to terminal and capturing to a temp file.
# Sets OUTFILE to the temp file path for post-processing.
# Usage: run_claude <prompt> [extra_args...]
run_claude() {
  local prompt="$1"; shift
  OUTFILE=$(mktemp)
  TMPFILES+=("$OUTFILE")

  # The prompt goes in on stdin: `--add-dir` is variadic and would swallow a trailing
  # positional prompt as another directory.
  set +e
  printf '%s' "$prompt" | claude \
    --print \
    --dangerously-skip-permissions \
    --disallowedTools EnterPlanMode \
    --model "$EXPECTED_MODEL" \
    --max-turns "$MAX_TURNS" \
    --verbose \
    --output-format stream-json \
    "${CLAUDE_ARGS[@]}" \
    "$@" \
  | { grep --line-buffered '^{' || true; } \
  | tee "$OUTFILE" \
  | jq --unbuffered -rj "$JQ_STREAM"
  local rc=${PIPESTATUS[1]}
  set -e

  if [[ $rc -ne 0 ]]; then
    echo "WARN: claude exited $rc; continuing." >&2
  fi
}

count_done() {
  if [[ -f "$TASKS_FILE" ]]; then
    grep -cE '^[[:space:]]*- \[[xX]\]' "$TASKS_FILE" || true
  else
    echo 0
  fi
}

# Main agent loop
prev_done=$(count_done)
stalled=0
result=""
for ((i=1; i<=ITERATIONS; i++)); do
  echo -e "\n=== Iteration $i/$ITERATIONS ===" >&2
  run_claude "$(cat "$PROMPT_FILE")"

  actual_model=$(jq -r "$JQ_MODEL" "$OUTFILE" | head -1)
  if [[ -n "$actual_model" && "$actual_model" != "$MODEL_BASE" ]]; then
    echo "ERROR: Expected model '$MODEL_BASE' but got '$actual_model'. Aborting." >&2
    exit 1
  fi

  result=$(jq -r "$JQ_RESULT" "$OUTFILE")
  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Agent loop complete after $i iterations."
    break
  fi

  if [[ -f "$TASKS_FILE" ]]; then
    done_now=$(count_done)
    if (( done_now > prev_done )); then stalled=0; else stalled=$((stalled + 1)); fi
    prev_done=$done_now
    echo "Progress: $done_now task(s) checked in $TASKS_FILE; $stalled stalled pass(es)." >&2
    if (( stalled >= STALL_LIMIT )); then
      echo "ERROR: No task completed in $STALL_LIMIT consecutive passes. Aborting." >&2
      exit 1
    fi
  fi
done

if [[ "$result" != *"<promise>COMPLETE</promise>"* ]]; then
  echo "WARNING: Agent loop did not complete within $ITERATIONS iterations." >&2
  exit 1
fi

# Post-loop code review
if [[ "$REVIEW" == true ]]; then
  echo -e "\n=== Starting automatic code review ===\n"
  run_claude "/simplify"
  echo -e "\n=== Code review session complete ==="
fi
