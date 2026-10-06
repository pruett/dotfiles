---
name: prune-tests
description: "Find tests that can't catch a bug, delete them, and open a PR. Touches tests only."
argument-hint: "[path…] [--base main] [--max 12]"
disable-model-invocation: true
---

# Prune Tests

Delete tests that can't fail for a real bug, then open one PR. Runs unattended, so decide from evidence, not by asking. Two certain deletions beat ten guesses.

Only touch tests and the helpers they leave unused. Never edit production code; list now-unused production exports in the PR instead.

## What counts as useless

A test is useless if either holds:

- **It can't fail.** It still passes when every function it imports from its subject is stubbed to return `undefined`/nil (do the stub in a scratch copy). Long-skipped tests (`.skip`, `xit`, `todo`, older than 90 days by blame) count too.
- **It's redundant.** Break the subject (swap a return value for a wrong literal); if another test goes red without this one, it adds nothing.

Suspects:

- **No real assertion:** asserts nothing, or only `toBeDefined`, `toBeTruthy`, `not.toThrow`, or similar.
- **Self-comparison:** the expected value comes from the subject itself, including snapshots updated without review.
- **Constant pin:** restates a hard-coded constant, config default, prompt string, or export list.
- **Fixture asserts fixture:** checks data the test built and never calls the subject.
- **Source grep:** reads source text and asserts a string or import is there.
- **Call-shape:** mocks an in-repo module and asserts only calls, call counts, or call order.
- **Mock proves mock:** the mock returns exactly the value the test then asserts.
- **Side channel:** checks results through raw DB queries, file reads, or private state instead of the interface.
- **Tautological:** computes the expected value with the same logic as the subject. Delete only if another test checks a hard-coded value; otherwise keep and suggest that rewrite in the PR.
- **Duplicate:** same subject, same inputs, same assertion as another test, often one layer shallower.
- **Test-only seam:** tests a private or underscore symbol, or an export only tests use.
- **Wrong-reason rejection:** a `toThrow()`/`rejects` with no error type or message that passes because of an unrelated guard.
- **Overpromising name:** the name claims more than the inputs actually exercise.

## Keep anyway

- The only test covering a public API, config, migration, security, or release contract.
- Regression tests tied to a named bug or incident.
- Tests where call order is the contract (retries, transactions, hooks).
- Type-level tests (`*.test-d.ts`) and tests of relations across table rows.
- Tests already failing on the base branch. Report them as possible bugs.
- Anything `AGENTS.md` / `CLAUDE.md` marks as protected.

## Steps

1. If an open PR from a `prune/` branch exists, print its URL and stop.
2. Find the test command and run the full suite on `--base` (default `main`). Note any failures.
3. Find suspects in the given paths (default: whole repo) and check each against the rules above.
4. On branch `prune/<YYYY-MM-DD>`, delete up to `--max` (default 12) useless tests plus any imports, fixtures, or files they leave empty. Run the full suite; if it goes red, restore that test.
5. Commit as `prune: remove <n> tests that can't catch bugs` and open the PR with `gh pr create`. In the body, list each deleted test as `` `file:line` test name: <why> ``, where the reason is one terse line naming the evidence (e.g. "passes with subject stubbed; only asserts `toBeDefined`" or "duplicate of `cart.test.ts:42`"). Then list suspects you kept, baseline failures, and unused production exports. Print the PR URL last.

If nothing qualifies, print what you found and stop without opening a PR.
