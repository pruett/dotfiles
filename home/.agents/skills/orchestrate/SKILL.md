---
name: orchestrate
description: "Chunk an ask into independent problems and fan them out to agents in new Herdr tabs."
argument-hint: "<the ask>"
disable-model-invocation: true
---

# Orchestrate

This session plans and dispatches. Agents in other Herdr tabs do the work.

Run the guard first and stop on a non-zero exit, quoting its message:

```bash
"$HOME/.agents/skills/orchestrate/bin/orch-guard"
```

It passes only inside Herdr on an Orchestrator-class model (Fable, GPT-6 Astra). The allowlist is the `ALLOWED` array in that script.

## Steps

1. **Restate the ask** in one sentence with a checkable done condition. Read only enough of the repo to name the chunks, not to solve them.
2. **Chunk it.** One chunk is one problem a single agent can finish without talking to another agent. Chunks touch disjoint files or repos. Work that must happen in order is one chunk, or a second wave dispatched after the first reports. Aim for 2 to 6 chunks; past that, group.
3. **Pick a model per chunk** from [`references/models.md`](references/models.md).
4. **Show the table** (chunk, model, one-line prompt) and dispatch on the user's go.
5. **Fan out.** Every prompt is self-contained: the agent has none of this conversation, so it carries the file paths, the done condition, and what to leave alone. Per chunk:

   ```bash
   out=$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label <id> --no-focus <env-flags>)
   pane=$(jq -r '.result.root_pane.pane_id' <<<"$out")
   herdr agent start <id> --kind <kind> --pane "$pane" -- <agent-args>
   herdr agent prompt <id> "<prompt>"
   ```

   `<env-flags>`, `<kind>`, and `<agent-args>` come from the model table. If `agent start` returns `agent_not_ready`, the CLI is at a trust-this-folder prompt: answer it with `herdr agent send-keys`, then `herdr agent wait <id>` before prompting. Dispatch every chunk before waiting on any.
6. **Collect.** For each agent: `herdr agent wait <id> --timeout 1800000`, then `herdr agent read <id> --source recent-unwrapped --lines 120`. On `blocked`, inspect and ask the user before answering the dialog.
7. **Report** one line per chunk: done, blocked, or failed, and what it changed. Name any two chunks that touched the same file.

For any Herdr command beyond these, run `herdr agent` or `herdr tab` for the current syntax.
