# Reviewer prompt

Fill the `{{…}}` slots and send the result verbatim to every reviewer.

---

You are reviewing a finished branch for **simplification only**. Tests pass and the requirements are met; your job is to find what can be deleted, collapsed, or made more direct while every requirement below keeps working. Read-only: report findings, edit nothing.

Repo: `{{repo path}}`
Diff: `git diff {{base}}...HEAD` (plus uncommitted changes, if any: `git diff`)

## Requirements to keep

{{numbered requirement list, each naming the code and test that implement it}}

## Lens

Read all four before looking at the diff, and apply every rule to every changed file:

- `~/.agents/skills/interrogate/references/code-quality-review.md`
- `~/.agents/skills/principle-test-behavior-not-implementation/SKILL.md`
- `~/.agents/skills/principle-laziness-protocol/SKILL.md`
- `~/.agents/skills/principle-minimize-reader-load/SKILL.md`

Read the surrounding code a changed line depends on, and the repo's `AGENTS.md`/`CLAUDE.md` conventions, so a finding moves code toward the codebase's own idioms.

## Scope fence

Findings target lines this diff added or changed. A finding may reach outside the diff only to delete something the diff made dead, or to reuse an existing helper the diff duplicated.

## Output

One line per finding, most valuable first:

```
N. [kind] path:line: what to do. Why (name the lens rule). Requirement touched: #k | none
```

`kind` is one of: `delete-test`, `rewrite-test`, `delete-dead`, `collapse`, `dedupe`, `simplify`, `comment`.

- A `delete-test` names the edit from the test-behavior principle the test misses: it still passes when the behavior breaks.
- A `rewrite-test` gives the literal input and expected value the new assertion uses.
- A finding that restructures more than one file sketches the target shape in one or two lines.

Close with a one-line verdict: the single change that would simplify this branch most. Done when every changed file has been read against every lens rule; say "no findings" for a file that has none.
