# Simplify: the smallest code that meets every requirement

Run once tests pass and requirements are met. Simplicity wins every tie; a requirement beats simplicity. This session is the **judge**: it owns the requirements and decides. Reviewers in fresh contexts (no authorship bias) only find.

1. **Freeze the start.** Start from a committed tree: if `git status` shows changes, ask the user to commit them so this pass is its own revertible diff. Record `git diff --shortstat <base>...HEAD`. Done when the tree is clean and the starting size is recorded.

2. **Baseline green.** Find the repo's test, lint and typecheck commands (`AGENTS.md`, `package.json` scripts, CI config) and run the ones covering changed files. Red stops the pass: simplifying on red hides regressions. Done when every command is green and you hold the exact list to rerun in step 6.

3. **List the requirements.** Read the PR (`gh pr view --json title,body,url`), its linked ticket and the conversation. Number them; each names the code that implements it and the test that proves it (or "untested"). Show the list to the user if you inferred any item. Done when every behavior the diff adds maps to a requirement or is flagged as scope creep.

4. **Dispatch reviewers.** Fill [`references/simplify-reviewer-prompt.md`](references/simplify-reviewer-prompt.md).
   - **Herdr** (`HERDR_ENV=1`): two read-only reviewers from different model families, Opus 5.5 (Claude) and GPT-6 Luna (Codex, `-s read-only`), with the fan-out and collect commands in `~/.agents/skills/orchestrate/SKILL.md` and rows from its `references/models.md`. Skip orchestrate's chunking and approval; this is a fixed two-reviewer dispatch. Collect with `--lines 400`.
   - **No Herdr:** one fresh `general-purpose` subagent with the filled prompt.

   Done when every reviewer has returned its closing verdict.

5. **Judge.** Merge duplicate findings; two families flagging the same line is strong signal. For each finding:
   - **Reject** if it breaks a listed requirement, removes the only test proving one, or crosses the prompt's scope fence.
   - **Tests:** accept `delete-test` only when the test still passes with the behavior broken (`~/.agents/skills/principle-test-behavior-not-implementation/SKILL.md`). A weak test that is the only proof of a requirement gets rewritten, not deleted.
   - **Accept** the rest, biggest structural win first.

   Done when every finding has a verdict with a one-clause reason.

6. **Apply and prove.** Apply accepted findings one at a time, running the fastest check covering the touched file after each. A finding that turns a check red is reverted, not patched around. Finish with the full step 2 list. Done when every command is green on the final tree.

7. **Report.**
   - Size: step 1 shortstat → final shortstat.
   - Applied: one line per change.
   - Tests deleted or rewritten, each with the reason.
   - Rejected: one line each with the reason.
   - Reverted after going red.
   - Open: untested requirements, scope creep, structural moves too big for this pass.

   Leave the changes uncommitted for the user to review.
