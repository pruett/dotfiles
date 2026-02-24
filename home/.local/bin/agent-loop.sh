#!/bin/bash
set -eo pipefail

ITERATIONS=25
EXPECTED_MODEL="claude-opus-4-6"
PROMPT_FILE="AGENT-LOOP-PROMPT.md"
REVIEW=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations) ITERATIONS="$2"; shift 2 ;;
    --model)      EXPECTED_MODEL="$2"; shift 2 ;;
    --prompt)     PROMPT_FILE="$2"; shift 2 ;;
    --review)     REVIEW=true; shift ;;
    --no-review)  REVIEW=false; shift ;;
    *)
      echo "Usage: $(basename "$0") [--iterations N] [--model MODEL] [--prompt FILE] [--review]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Prompt file '$PROMPT_FILE' not found." >&2
  exit 1
fi

SANDBOX_SETTINGS='{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"excludedCommands":["docker"],"network":{"allowedDomains":["github.com","*npmjs.org"]}}}'

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

  claude \
    --print \
    --dangerously-skip-permissions \
    --disallowedTools EnterPlanMode \
    --max-turns 50 \
    --settings "$SANDBOX_SETTINGS" \
    --verbose \
    --output-format stream-json \
    "$@" \
    "$prompt" \
  | grep --line-buffered '^{' \
  | tee "$OUTFILE" \
  | jq --unbuffered -rj "$JQ_STREAM"
}

# Main agent loop
for ((i=1; i<=ITERATIONS; i++)); do
  run_claude "$(cat "$PROMPT_FILE")"

  actual_model=$(jq -r "$JQ_MODEL" "$OUTFILE" | head -1)
  if [[ -n "$actual_model" && "$actual_model" != "$EXPECTED_MODEL" ]]; then
    echo "ERROR: Expected model '$EXPECTED_MODEL' but got '$actual_model'. Aborting." >&2
    exit 1
  fi

  result=$(jq -r "$JQ_RESULT" "$OUTFILE")
  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Agent loop complete after $i iterations."
    break
  fi
done

if [[ "$result" != *"<promise>COMPLETE</promise>"* ]]; then
  echo "WARNING: Agent loop did not complete within $ITERATIONS iterations." >&2
  exit 1
fi

# Post-loop code review
if [[ "$REVIEW" == true ]]; then
  echo -e "\n=== Starting automatic code review ===\n"
  run_claude "/code-review"
  echo -e "\n=== Code review session complete ==="
fi
