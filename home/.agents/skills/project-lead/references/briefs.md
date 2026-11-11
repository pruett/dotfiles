# Briefs and launches

## Launch

One worker per chunk, started in the background with `cos run`, named `<project>-<role>-<slug>` (32 characters at most):

```sh
dir=$(wt new <repo>/<slug>)        # code-writing chunks only; prints the worktree path
cos run implementer api-impl-ratelimit --cwd "$dir" "<brief>"
```

- Code-writing chunks (`implementer`) each get their own worktree from `wt new` (the worktrees skill); `researcher`, `reviewer` and `tester` run in the repo or in the worktree they look at.
- The brief is the worker's first prompt and its role's rules are its system prompt, so the brief holds only the work. `cos run` accepts Claude's folder-trust prompt itself; when it warns the worker reported no status, `hc read <name>` before doing anything else.

## Brief

Each brief stands alone: the worker has no access to your chat. Size it to the chunk, but always fill every field:

```
GOAL        one sentence a stranger could carry out
SCOPE       paths it may write; paths it may not; its worktree
CONTEXT     file and PR pointers; earlier workers' results pasted in full or by path
PRINCIPLES  the principle files it reads and follows, by path (see Principles below)
ACCEPTANCE  checkable criteria, one per line
VERIFY      exact commands to run, plus known gotchas
EVIDENCE    where to save screenshots / recordings / findings (a folder under the project's state folder)
FORBIDDEN   no merges, no rebases of shared branches, no edits outside SCOPE, no new agents
REPORT      hc send <your hc name> "<status, branch, PR, commands run + output, evidence paths, deviations>"
```

Name in CONTEXT any skill the chunk needs. A skill marked `disable-model-invocation: true` in its SKILL.md loads only from a slash command, and a `/<name>` inside a brief arrives as plain text, so the skill never loads. Name those by file: "read and follow `~/.agents/skills/<name>/SKILL.md`". Name any other skill as "use the `<name>` skill".

Put your own hc name in REPORT literally (for example `hc send lead-api "..."`), so the worker reports to you even if your terminal address changes.

## Principles

Workers read pstack's principles by file, since each is a slash-only skill: name them in PRINCIPLES as `~/.agents/skills/principle-<name>/SKILL.md`. Pick from the rows the chunk matches; three or four is typical, and a chunk that matches no row gets none.

| The chunk | Principles to name |
|---|---|
| any code change | prove-it-works, laziness-protocol, minimize-reader-load |
| new types, data structures, or the core of a feature | foundational-thinking, model-the-domain, type-system-discipline |
| a new requirement in an existing design | redesign-from-first-principles, subtract-before-you-add |
| validation, error handling, framework adapters | boundary-discipline |
| commands, lifecycle steps, loops that may rerun after a crash | make-operations-idempotent |
| a new internal API with old callers | migrate-callers-then-delete-legacy-apis, outcome-oriented-execution |
| a migration, sweep, or run of similar edits | build-the-lever, sequence-verifiable-units |
| debugging | fix-root-causes, attack-the-premise |
| writing or changing tests | test-behavior-not-implementation |
| measuring performance or an eval | explain-the-number |
| a novel interaction or architecture with no precedent | exhaust-the-design-space, experience-first |
| a reviewer | the same principles its implementer was given |

## Rounds

- A reviewer's findings go back to the implementer that wrote the code, in one message listing every finding.
- A tester's `ISSUES` go back the same way. Rerun the tester after the fix.
- Accept a chunk only when its ACCEPTANCE lines are all checked against evidence you read.
