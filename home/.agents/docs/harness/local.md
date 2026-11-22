# pstack in this setup

pstack skills are written for Cursor. This setup installs only some of them, in `~/.agents/skills/`, for any harness. Read this file once per session before following a pstack skill, then apply the maps below.

In Claude Code, also read [`claude-code.md`](claude-code.md) for tool, subagent and model names. In another harness, map Cursor's names to its nearest equivalents the same way: `Task` is a subagent, `AskQuestion` is the harness's question tool or plain text, a todolist is the harness's todo tool or a list in your reply.

## Skills not installed

| A pstack skill says | Use |
| --- | --- |
| the **poteto-mode** skill, its Principles or Subagents section | `~/.agents/skills/mode/SKILL.md`, which has both sections |
| a poteto-mode playbook | `~/.agents/skills/mode/playbooks/<name>.md`; a PR playbook (babysit, shipping, opening a PR) is the **pr** skill |
| the **arena** skill, or "arena Phase X" | `~/.agents/skills/orchestrate/references/bake-off.md`, same phase letters |
| the **swarm** skill | `~/.agents/skills/orchestrate/references/race.md` |
| `/setup-pstack`, `pstack-models.mdc`, a role's model line | Not used. Take the skill's default model, mapped per your harness, and pick effort per the Subagents section of **mode** |
| `poteto-agent` | A general-purpose subagent whose brief starts `Read ~/.agents/skills/mode/worker.md before anything else.` |
| `comment-sicko` | A general-purpose subagent whose brief starts `Read ~/.agents/docs/harness/agents/comment-sicko.md and act as that agent.` |
| `/deslop`, `control-ui`, `control-cli`, other `cursor-team-kit` skills | Not installed. Skip the step with one line saying so |
