# Briefs and launches

## Launch

One worker per chunk, started in the background with `cos run`, named `<project>-<role>-<slug>` (32 characters at most):

```sh
dir=$(wt new <repo>/<slug>)        # code-writing chunks only; prints the worktree path
cos run implementer api-impl-ratelimit --cwd "$dir" "<brief>"
```

- Code-writing chunks (`implementer`) each get their own worktree from `wt new` (the worktrees skill); `researcher`, `reviewer` and `tester` run in the repo or in the worktree they look at.
- The brief is the worker's first prompt and its role's rules are its system prompt, so the brief holds only the work. `cos run` accepts Claude's folder-trust prompt itself; when it warns the worker reported no status, `hc read <name>` before doing anything else.
- Start every independent chunk before waiting on any.

## Brief

Each brief stands alone: the worker has no access to your chat. Size it to the chunk, but always fill every field:

```
GOAL        one sentence a stranger could carry out
SCOPE       paths it may write; paths it may not; its worktree
CONTEXT     file and PR pointers; earlier workers' results pasted in full or by path
ACCEPTANCE  checkable criteria, one per line
VERIFY      exact commands to run, plus known gotchas
EVIDENCE    where to save screenshots / recordings / findings (a folder under the project's state folder)
FORBIDDEN   no merges, no rebases of shared branches, no edits outside SCOPE, no new agents
REPORT      hc send <your hc name> "<status, branch, PR, commands run + output, evidence paths, deviations>"
```

Put your own hc name in REPORT literally (for example `hc send lead-api "..."`), so the worker reports to you even if your terminal address changes.

## Rounds

- A reviewer's findings go back to the implementer that wrote the code, in one message listing every finding.
- A tester's `ISSUES` go back the same way. Rerun the tester after the fix.
- Accept a chunk only when its ACCEPTANCE lines are all checked against evidence you read.
