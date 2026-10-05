# PR body template

Title: `cull: remove <n> tests that cannot fail for a defect`

```markdown
Weekly test cull. Each deleted test was proven unable to detect a defect, or proven duplicate of a surviving test. Production code is untouched; `git diff --numstat` shows <test lines removed> test lines, 0 production lines.

## Deleted: Proven (<n>)

Still green with every imported subject function returning `undefined`, or skipped for over 90 days.

| Test | Location | Pattern | Proof |
|---|---|---|---|
| <name> | `<file:line>` | <pattern> | stub fault green (`<command>`) |

## Deleted: Covered (<n>)

Matched a junk pattern; another test catches the same break.

| Test | Location | Pattern | Owner test that stays red |
|---|---|---|---|
| <name> | `<file:line>` | <pattern> | `<owner file:line>` |

## Flagged, not deleted (<n>)

Matched a pattern but detects a fault with no cover. Human call.

- `<file:line>` <name>: <pattern>. Suggested rewrite: <one line>.

## Red on baseline (<n>)

Failing before this PR; possible product bugs, left untouched.

- `<file:line>` <name>

## Follow-ups

- Production exports now called only by tests: <list or "none">.
- Candidates reverted after turning the suite red: <list or "none">.

Validation: `<full suite command>` green on the final tree.
```

Omit any section with a zero count except Proven and Covered.
