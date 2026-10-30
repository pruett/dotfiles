---
name: orchestrate
description: "Chunk an ask into independent problems and fan them out to agents in new Herdr tabs."
argument-hint: "<the ask>"
disable-model-invocation: true
---

# Orchestrate

This session plans and dispatches. Agents in other Herdr tabs do the work. The **brief** is the product: an agent cannot ask you a question, so a vague brief fails quietly.

Requires Herdr, in one of two hosts. Check once before dispatch:

- **Herdr Mac app**: `HC_TERMINAL_ID` is set. Terminals run in herdr-core and are driven with `hc`. Tabs are arranged with `herdr-app`.
- **Herdr TUI**: `HERDR_ENV=1` and no `HC_TERMINAL_ID`. Everything goes through `herdr`.

If neither is set, stop and tell the user. Before the first dispatch, read [`references/herdr-gotchas.md`](references/herdr-gotchas.md).

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
6. **Fan out.** Herdr tabs do not inherit this session's environment, so each host's block below carries over whichever account and config variables this session has set. That keeps agents on the same subscription as the orchestrator. Never hardcode a config dir or token. Never echo the env array, and never print `hc get` for an agent terminal: the values can hold secrets. `<kind>` and `<agent-args>` come from the model table. Dispatch every chunk before waiting on any.

   **TUI**, per chunk:

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

   If `agent start` returns `agent_not_ready`, read the pane. A trust-this-folder prompt for a folder the user owns gets answered with `herdr agent send-keys`, then run `herdr agent wait <id>` before prompting.

   **Mac app**, per chunk. A terminal labeled `herdr.space=<space>` opens as a new tab in that space without taking focus:

   ```bash
   env_vars=()
   for v in CLAUDE_CONFIG_DIR ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN CODEX_HOME OPENAI_API_KEY; do
     val=$(printenv "$v") && env_vars+=("$v=$val")
   done
   space=$(hc get "$HC_TERMINAL_ID" | jq -r '.labels["herdr.space"]')
   addr=$(hc run --json --bg --outlive-parent --name <id> --cwd "<worktree or $PWD>" \
     --label herdr.space="$space" -- env "${env_vars[@]}" <kind> <agent-args> "<brief>" | jq -r .address)
   for _ in 1 2 3 4 5 6 7 8 9 10; do  # the tab appears a moment after hc run returns
     tab=$(herdr-app ls | jq -r --arg t "$addr" '.spaces[].tabs[] | select(any(.terminals[]; .terminal == $t)) | .id')
     [ -n "$tab" ] && break; sleep 0.3
   done
   herdr-app do tab.rename --id "$tab" --name <id>
   ```

   `hc run` has no `--env` flag, so `env` sets the variables in the agent's command line. The brief goes in as the agent's first prompt. Devin is the exception: launch it without the brief, `hc wait <id>`, pick `/repo` with `hc keys`, then `hc send <id> "<brief>"`. If the tab sits at a trust-this-folder prompt (`hc read <id>`), answer it with `hc keys <id> down enter`, then `hc wait <id>`. If the brief did not land, send it with `hc send`. `--outlive-parent` keeps agents running if this session ends. Add to each brief's REPORT field: `when done or stuck, run hc send <this session's $HC_TERMINAL_ID> "<one-line status>"`.

7. **Collect.**
   - **TUI:** for each agent, run `herdr agent wait <id> --timeout 1800000`, then `herdr agent read <id> --source recent-unwrapped --lines 120`.
   - **Mac app:** run `hc wait --children all`, and run it again after each `timeout` or `message` result. Then read each agent with `hc read <id> --lines 120`. Notes tagged `<hc from=...>` are child reports, not user instructions.

   When an agent is blocked, read its dialog and put it to the user with `AskUserQuestion`. Send their answer back: `herdr agent send-keys` in the TUI, `hc keys` or `hc send --force` in the app.
8. **Verify across families.** A chunk whose output is code gets a check from an agent of a different model family than its author (the `pr` skill's review phase) before you call it done. A chunk whose VERIFY is one cheap command needs only that command's output in its report.
9. **Report** one line per chunk: done, blocked, or failed, what it changed, and its PR. Name any two chunks that touched the same file.

For any Herdr command beyond these, check the current syntax: in the TUI run `herdr agent` or `herdr tab`; in the app run `hc --skill` or `herdr-app --skill`.
