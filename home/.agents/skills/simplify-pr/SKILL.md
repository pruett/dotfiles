---
name: simplify-pr
description: "End-of-PR simplification pass: fresh reviewers find deletions and collapses, this session applies the ones that keep every requirement green."
argument-hint: "[base ref, default main] [PR number | ticket id]"
disable-model-invocation: true
---

# Simplify PR

Run at the end of a PR session, once tests pass and requirements are met. Goal: the smallest, most direct code that still meets every requirement. Simplicity wins every tie; a requirement beats simplicity.

This session is the **judge**: it owns the requirements and decides. Reviewers in fresh contexts (no authorship bias) only find.

## Steps

1. **Freeze the start.** Start from a committed tree: if `git status` shows changes, ask the user to commit them so this pass is its own revertible diff. Record `git diff --shortstat <base>...HEAD`. Done when the tree is clean and the starting size is recorded.

2. **Baseline green.** Find the repo's test, lint, and typecheck commands (`AGENTS.md`, `package.json` scripts, CI config) and run the ones covering changed files. If any is red, stop and report: simplifying on red hides regressions. Done when every command is green and you have the exact command list to rerun in step 6.

3. **List the requirements.** Read the PR (`gh pr view --json title,body,url`), its linked ticket, and the conversation. Write a numbered list; each requirement names the code that implements it and the test that proves it (or "untested"). Show the list to the user if you had to infer any item. Done when every behavior the diff adds maps to a requirement or is flagged as scope creep.

4. **Dispatch reviewers.** Fill [`references/reviewer-prompt.md`](references/reviewer-prompt.md).
   - **Herdr** (`HERDR_ENV=1`): dispatch two read-only reviewers from different model families with the fan-out and collect commands in `~/.agents/skills/orchestrate/SKILL.md` (steps 5–6), picking rows from `~/.agents/skills/orchestrate/references/models.md`: Opus 5.5 (Claude) and GPT-6 Luna (Codex, `-s read-only`). Skip orchestrate's chunking and approval table; this is a fixed two-reviewer dispatch. Collect with `--lines 400`.
   - **No Herdr:** spawn one fresh subagent with the filled prompt.

   Done when every reviewer has returned its closing verdict.

5. **Judge.** Merge duplicate findings; two families flagging the same line is strong signal. For each finding, accept or reject:
   - **Reject** if it breaks a listed requirement, removes the only test proving one, or crosses the prompt's scope fence.
   - **Tests:** accept `delete-test` only when the test passes the `undefined` check in [`references/test-behavior.md`](references/test-behavior.md) (it cannot fail for a defect). A weak test that is the only proof of a requirement gets rewritten, not deleted.
   - **Accept** the rest, biggest structural win first.

   Done when every finding has a verdict with a one-clause reason.

6. **Apply and prove.** Apply accepted findings one at a time, running the fastest check covering the touched file after each. A finding that turns a check red is reverted, not patched around. Finish with the full step 2 command list. Done when every step 2 command is green on the final tree.

7. **Report.**
   - Size: step 1 shortstat → final `git diff --shortstat <base>...HEAD`.
   - Applied: one line per change.
   - Tests deleted or rewritten, each with its no-behavior shape.
   - Rejected: one line each with the reason.
   - Reverted after going red.
   - Open: requirements flagged untested or scope creep, and structural moves too big for this pass.

   Leave the changes uncommitted for the user to review.
