# Dispatching reviewers

Review sends one filled prompt to fresh-context, read-only reviewers. Two model families catch more than one.

## With Herdr (`HERDR_ENV=1`)

Two reviewers: `rev-claude` (Opus 5.5) and `rev-codex` (GPT-6 Luna, read-only sandbox). Save the filled prompt to `<scratchpad>/review-prompt.md`, then for each:

```bash
env_flags=()
for v in CLAUDE_CONFIG_DIR ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN CODEX_HOME OPENAI_API_KEY; do
  val=$(printenv "$v") && env_flags+=(--env "$v=$val")
done
out=$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label <id> --no-focus "${env_flags[@]}")
pane=$(jq -r '.result.root_pane.pane_id' <<<"$out")
herdr agent start <id> --kind <kind> --pane "$pane" -- <args>
herdr agent prompt <id> "$(cat <scratchpad>/review-prompt.md)"
```

| id | `<kind>` | `<args>` |
|---|---|---|
| `rev-claude` | `claude` | `--model claude-opus-5-5` |
| `rev-codex` | `codex` | `-m gpt-6-luna -s read-only` |

Never echo `env_flags`; it can hold secrets. Start both before waiting on either. Collect each with `herdr agent wait <id> --timeout 1800000`, then `herdr agent read <id> --source recent-unwrapped --lines 400`. If `agent start` returns `agent_not_ready`, read the pane: answer a trust-this-folder prompt with `herdr agent send-keys`, then `herdr agent wait <id>` before prompting.

## Without Herdr

`general-purpose` subagents launched in one message, with the filled prompt as their task. Say in the verdict that every reviewer was Claude.
