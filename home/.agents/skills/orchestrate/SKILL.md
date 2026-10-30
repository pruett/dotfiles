---
name: orchestrate
description: "Chunk an ask into independent problems and fan them out to agents in new Herdr tabs."
argument-hint: "<the ask>"
disable-model-invocation: true
---

# Orchestrate

This session plans and dispatches. Agents in other Herdr tabs do the work. 

Requires Herdr. Use exactly one CLI, picked by environment:

- `HERDR_ENV=1`: Herdr TUI. Load the `herdr` skill and use `herdr`.
- Else `HC_TERMINAL_ID` set: Herdr Mac app. Run `hc --skill` and use `hc`.
- Neither: stop and tell the user.

Before the first dispatch, read the sections of [`references/agent-gotchas.md`](references/agent-gotchas.md) for the agent kinds and Herdr CLI you use.

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
6. **Fan out.** Per chunk, open a background tab in the current workspace with the worktree as cwd, start `<kind> <agent-args>` from the model table, and give it the brief as its first prompt. Tabs do not inherit this session's environment: pass along whichever of `CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `CODEX_HOME`, `OPENAI_API_KEY` are set, and keep their values out of your output. Dispatch every chunk before waiting on any.
7. **Collect.** Wait on each agent, then read its last 120 lines. When one is blocked, put its dialog to the user with `AskUserQuestion` and send their answer back.
8. **Verify across families.** A chunk whose output is code gets a check from an agent of a different model family than its author (the `pr` skill's review phase) before you call it done. A chunk whose VERIFY is one cheap command needs only that command's output in its report.
9. **Report** one line per chunk: done, blocked, or failed, what it changed, and its PR. Name any two chunks that touched the same file.
