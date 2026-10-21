---
name: orchestrate
description: "Chunk an ask into independent problems and fan them out to agents in new Herdr tabs."
argument-hint: "<the ask>"
disable-model-invocation: true
---

# Orchestrate

This session plans and dispatches. Agents in other Herdr tabs do the work. The **brief** is the product: an agent cannot ask you a question, so a vague brief fails quietly.

Requires Herdr (`HERDR_ENV=1`). Before the first dispatch, read [`references/herdr-gotchas.md`](references/herdr-gotchas.md).

## Steps

1. **Restate the ask** in one sentence with a checkable done condition. Read only enough of the repo to name the chunks, not to solve them. A standing program (multi-day, many stacked PRs, a fleet under one coordinator) goes to pstack's Orchestrate playbook instead: `~/.agents/skills/poteto-mode/playbooks/orchestrate.md`.
2. **Chunk it.** One chunk is one problem a single agent can finish without talking to another agent. Chunks touch disjoint files or repos. Work that must happen in order is one chunk, or a second wave dispatched after the first reports. Use the fewest chunks the work allows; one is common.
3. **Pick a model per chunk** from [`references/models.md`](references/models.md).
4. **Get the go-ahead.** Show the table (chunk, model, one-line goal). With more than one chunk, or a done condition you inferred rather than read, ask with `AskUserQuestion` (options: dispatch, change the plan) and wait for the answer. One chunk with a stated done condition dispatches at once. Done when the user chose dispatch, or the single-chunk case applies.
5. **Write each brief** with these fields, sized to the chunk (a one-command chunk gets a paragraph that still names goal, scope, verify and report):

   ```
   GOAL        one sentence, executable by a stranger with no chat access
   SCOPE       paths it may write; paths it may not; its worktree
   CONTEXT     file and PR pointers; upstream reports pasted in full
   ACCEPTANCE  checkable criteria, one per line
   VERIFY      exact commands, plus known gotchas
   FORBIDDEN   no merges, no rebases of shared branches, no fixes outside scope
   REPORT      status, branch, PR, what it ran and the output, deviations
   ```

   A chunk that edits code gets its own worktree: `wt new <repo>/<slug>` (worktrees skill) prints the path to use as `--cwd`, after running the repo's setup. A chunk that opens a PR ends with the `pr` skill's draft phase and returns the URL; babysitting waits until every chunk's PR exists.
6. **Fan out.** Per chunk:

   ```bash
   env_flags=()
   for v in CLAUDE_CONFIG_DIR ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN CODEX_HOME OPENAI_API_KEY; do
     val=$(printenv "$v") && env_flags+=(--env "$v=$val")
   done
   out=$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "<worktree or $PWD>" --label <id> --no-focus "${env_flags[@]}")
   pane=$(jq -r '.result.root_pane.pane_id' <<<"$out")
   herdr agent start <id> --kind <kind> --pane "$pane" -- <agent-args>
   herdr agent prompt <id> "<brief>"
   ```

   Herdr tabs do not inherit this session's environment, so the loop carries over whichever account and config variables this session has set. That keeps agents on the same subscription as the orchestrator. Never hardcode a config dir or token, and never echo `env_flags`: it can hold secrets. `<kind>` and `<agent-args>` come from the model table. If `agent start` returns `agent_not_ready`, read the pane: a trust-this-folder prompt for a folder the user owns gets answered with `herdr agent send-keys`, then `herdr agent wait <id>` before prompting. Dispatch every chunk before waiting on any.
7. **Collect.** For each agent: `herdr agent wait <id> --timeout 1800000`, then `herdr agent read <id> --source recent-unwrapped --lines 120`. On `blocked`, read the dialog and put it to the user with `AskUserQuestion`; their answer is what gets sent.
8. **Verify across families.** A chunk whose output is code gets a check from an agent of a different model family than its author (the `pr` skill's review phase) before you call it done. A chunk whose VERIFY is one cheap command needs only that command's output in its report.
9. **Report** one line per chunk: done, blocked, or failed, what it changed, and its PR. Name any two chunks that touched the same file.

For any Herdr command beyond these, run `herdr agent` or `herdr tab` for the current syntax.
