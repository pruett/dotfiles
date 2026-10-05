---
name: weed-tests
description: "Unattended sweep that deletes tests proven unable to fail for a defect, then opens one small PR. Deletes tests only; production code is untouched."
argument-hint: "[path…] [--base main] [--max <tests per PR, default 12>]"
disable-model-invocation: true
---

# Weed Tests

Weed the test suite: pull the tests that cost CI time and review attention while proving nothing, and open one reviewable PR. Runs unattended on a schedule, so every decision here is made by evidence, never by asking. Confidence beats count: pulling two proven weeds is a success, pulling ten guesses is a failure.

Scope fence: this skill deletes **tests and the test support they orphan**. Production code, including test-only exports it leaves behind, is reported as follow-up, never edited.

## Detection: the metric

A test earns its place by going **red for a defect**. The sweep measures that directly by injecting faults into the committed tree and watching the test:

- **Stub fault.** Every function the test imports from its subject is replaced with one returning `undefined` (or the language's nil). A test still green under the stub fault observes no behavior: it cannot fail for any defect. Mechanics per framework in [`references/stub-proof.md`](references/stub-proof.md).
- **Cover check.** With the candidate deleted, the subject's behavior is broken (one return value swapped for a wrong literal). Another surviving test must go red. If one does, the candidate was duplicate proof.

Each candidate lands in exactly one tier:

| Tier | Condition | Action |
|---|---|---|
| **Proven** | Green under stub fault, or skipped (`.skip`, `xit`, `todo`) with blame older than 90 days | Delete |
| **Covered** | Matches a junk pattern and passes the cover check | Delete |
| **Flagged** | Matches a junk pattern but detects a fault with no cover | Report only |

A tautological test that recomputes its expected value inline does go red when the subject breaks, so it lands in Flagged unless a literal-oracle test covers it. The PR body names it with a rewrite suggestion; deleting it is a human call.

## Retention bar

A Proven or Covered candidate is demoted to Flagged when any of these hold:

- it is the only test naming a public API, protocol, config, migration, storage, security, or release contract, even weakly;
- it is a regression test whose commit message or comment names a bug or incident;
- it asserts call ordering where ordering is the observable contract (retries, transactions, lifecycle hooks);
- it is a type-level test (`*.test-d.ts`) or a relation across table rows;
- it is red on the baseline. That is a possible product bug, reported under its own heading, never deleted;
- a root or scoped `AGENTS.md` / `CLAUDE.md` names it or its area as protected.

Slow or static is never a reason to pull a test.

## Steps

1. **Baseline.** Parse arguments: paths narrow the sweep (default: whole repo), `--base` is the target branch (default `main`), `--max` caps the number of tests pulled per PR (default 12). Read root and scoped `AGENTS.md` / `CLAUDE.md`. Check `gh pr list --state open --search "head:weed/"`; an open weed PR means stop and report its URL, since one coherent PR lands at a time. Find the test runner command from the repo's scripts or CI config. Run the full suite on a clean checkout of the base and record every red test. Done when the tree is clean, the runner command is known, and baseline reds are recorded.

2. **Discover.** Read-only. Hunt each pattern in [`references/junk-patterns.md`](references/junk-patterns.md) with the greps it lists, plus skipped tests via blame. Read every hit in full, together with its subject and the sibling tests of that subject. Collect at most three times `--max` candidates, most mechanical patterns first. Done when every candidate has an evidence card started: exact test name, `file:line`, matched pattern.

3. **Prove.** For each candidate, run the stub fault on its file. Green means Proven. Red means run the cover check when the pattern is duplicate, call-shape, or tautological; otherwise the candidate is Flagged. Complete the evidence card: tier, the fault command and its output, the surviving owner test for Covered, the production seam left callerless. Done when every candidate has a tier and a complete card. A card missing any field is Flagged.

4. **Retain.** Pass every Proven and Covered card through the retention bar. Done when each card records which bar rule it cleared or which one demoted it.

5. **Cut.** Branch `weed/<YYYY-MM-DD>` from base. Delete Proven and Covered tests up to `--max`, most mechanical tier first. In the same files, remove imports, fixtures, and helpers that nothing else uses; delete a file when it holds no tests. Run the touched files, then the full suite. A red run reverts that deletion and demotes the card to Flagged with the output attached. Done when the full suite is green on the final tree and `git diff --numstat` shows zero production lines changed.

6. **Open the PR.** Commit as `weed: pull <n> tests that cannot fail for a defect`. Fill [`references/pr-body.md`](references/pr-body.md) from the evidence cards and open the PR against base with `gh pr create`. Done when the PR URL is printed as the last line of output.

With zero Proven or Covered candidates after step 4, print the Flagged list and the baseline reds and stop; opening an empty PR is a failure.
