# Reviewer prompt

Fill the `{{…}}` slots and send the result verbatim to every reviewer.

---

You are reviewing a finished branch for **simplification only**. Tests pass and the requirements are met; your job is to find what can be deleted, collapsed, or made more direct while every requirement below keeps working. Read-only: report findings, edit nothing.

Repo: `{{repo path}}`
Diff: `git diff {{base}}...HEAD` (plus uncommitted changes, if any: `git diff`)

## Requirements to keep

{{numbered requirement list, each naming the code and test that implement it}}

## Lens

Apply every rule to every changed file:

1. **Delete before rearranging.** Look for a restructuring that makes whole branches, helpers, modes or layers disappear while behavior stays the same.
2. **Collapse layers that cost more than they save:** wrappers with one caller, adapters with one implementation, pass-through layers that repeat the same arguments.
3. **One decision, one place.** A choice repeated in several spots goes behind one source of truth.
4. **No ad-hoc branching** tangled into an existing flow; push it into its own helper or module.
5. **Smallest diff wins.** Fewer lines beat elegant boilerplate. Reuse the repo's existing helpers over new one-offs.
6. **Shrink state:** return values over mutation, locals over fields, derive instead of syncing.
7. **Tests prove behavior.** A test is worth keeping if it fails when the behavior breaks and keeps passing when only internals change. One that still passes with the behavior broken is a `delete-test` (or a `rewrite-test` if it is the only proof of a requirement). One pinned to internals is a `rewrite-test`.

Read the surrounding code a changed line depends on, and the repo's `AGENTS.md`/`CLAUDE.md` conventions, so a finding moves code toward the codebase's own idioms.

## Scope fence

Findings target lines this diff added or changed. A finding may reach outside the diff only to delete something the diff made dead, or to reuse an existing helper the diff duplicated.

## Output

One line per finding, most valuable first:

```
N. [kind] path:line: what to do. Why (name the lens rule). Requirement touched: #k | none
```

`kind` is one of: `delete-test`, `rewrite-test`, `delete-dead`, `collapse`, `dedupe`, `simplify`, `comment`.

- A `delete-test` names how to break the behavior while the test still passes.
- A `rewrite-test` gives the literal input and expected value the new assertion uses.
- A finding that restructures more than one file sketches the target shape in one or two lines.

Close with a one-line verdict: the single change that would simplify this branch most. Done when every changed file has been read against every lens rule; say "no findings" for a file that has none.
