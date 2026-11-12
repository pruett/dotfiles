# Briefs and launches

## Launch

One worker per chunk, started in the background with `fleet run`, which names it `<project>-<role>-<slug>` (32 characters at most), saves the brief to `briefs/`, and starts it so it outlives your restarts:

```sh
dir=$(wt new <repo>/<project>-<slug>)        # code-writing chunks only; prints the worktree path
fleet run implementer ratelimit --cwd "$dir" "<brief>"
```

- Code-writing chunks (`implementer`, and `cloud-agent` when it writes code) each get their own worktree from `wt new` (the worktrees skill); `researcher`, `reviewer` and `tester` run in the repo or in the worktree they look at.
- `cloud-agent` (Devin) must start under `$FLEET_WORK_ROOT/<company>/`: its Devin account is the company folder.
- The brief is the worker's first prompt and its role's rules (`roles/worker.md`) are its system prompt, so the brief holds only the work. `fleet run` accepts Claude's folder-trust prompt itself; when it warns the worker reported no status, `hc read <name>` before anything else.

## Brief

Each brief stands alone: the worker has no access to your chat. Size it to the chunk, but always fill every field:

```
GOAL        one sentence a stranger could carry out
SCOPE       paths it may write; paths it may not; its worktree
CONTEXT     file and PR pointers; the PRD lines it serves; earlier workers' results pasted in full or by path
PRINCIPLES  the principle files it reads and follows, by path (principles.md says which)
ACCEPTANCE  checkable criteria, one per line
VERIFY      exact commands to run, plus known gotchas
EVIDENCE    where to save screenshots / recordings / findings: $FLEET_PROJECT_DIR/evidence/<worker>/
FORBIDDEN   no merges, no rebases of shared branches, no edits outside SCOPE, no new agents
REPORT      hc send lead-<project> "<status, branch, PR, commands run + output, evidence paths, deviations>"
```

Put your hc name in REPORT literally, so the worker reaches you after a handoff too.

Name in CONTEXT any skill the chunk needs. A skill marked `disable-model-invocation: true` in its SKILL.md loads only from a slash command, and a `/<name>` inside a brief arrives as plain text, so the skill never loads. Name those by file: "read and follow `~/.agents/skills/<name>/SKILL.md`". Name any other skill as "use the `<name>` skill". A chunk that opens a PR ends with the `pr` skill's draft phase and reports the URL.

## Rounds

- A reviewer's findings go back to the implementer that wrote the code, in one message listing every finding.
- A tester's `ISSUES` go back the same way. Rerun the tester after the fix.
- Accept a chunk only when its ACCEPTANCE lines are all checked against evidence you read.
