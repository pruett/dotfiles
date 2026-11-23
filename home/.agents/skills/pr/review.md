# Review: find what is wrong or removable, then apply only if asked

Fresh-context reviewers find; this session is the **judge**: it owns the requirements and decides. Two outcomes:

- **report** (review, interrogate, tear it apart): stop after the verdict in step 5. An accepted finding becomes a fix only when the user says so.
- **apply** (simplify, trim, make it smaller): also run step 6. A requirement beats simplicity; simplicity wins every tie.

1. **Scope.** PR number or URL: `gh pr diff <n>`. Branch or nothing: `git diff $(git merge-base main HEAD)...HEAD`. Files the user named: those. Done when you hold the diff and the context files a reviewer needs.

2. **Intent and requirements.** From the request, the PR (`gh pr view --json title,body,url`), its linked ticket, commits and the code, write one paragraph of intent, then a numbered requirement list; each names the code that implements it and the test that proves it (or "untested"). Show the list to the user if you inferred any item. Done when every behavior the diff adds maps to a requirement or is flagged as scope creep.

3. **Dispatch.** Fill [`references/review-prompt.md`](references/review-prompt.md) and send it per [`references/reviewers.md`](references/reviewers.md). Without Herdr, use two subagents: `model: "opus"` and `model: "fable"`. Done when every reviewer has returned.

4. **Judge.** Merge findings that describe the same issue and note which reviewers raised each. Then sort by kind:
   - **Defects** (`bug`, `security`, `rewrite-test`): run each repro yourself, from a scratch copy in the session scratchpad against the PR's worktree. Keep a defect only when the output shows the failure and the failure breaks the intent or a listed requirement. A defect without a repro, or whose repro passes, goes to Dismissed with that reason. Two reviewers raising one proven defect is the strongest signal.
   - **Shape** (`design`, `delete-dead`, `collapse`, `dedupe`, `simplify`, `delete-test`): judge on the merits. Dismiss "I would have done it differently" with no concrete problem, abstractions for code that changes in only one way, and findings on code the diff did not touch or against a pattern the codebase uses everywhere. Reject a simplification that breaks a listed requirement or removes the only test proving one. Accept `delete-test` only when the test still passes with the behavior broken; the only proof of a requirement gets rewritten, not deleted.

   Review the change once, against the step 2 requirements; add no second round or wider bar. Done when every finding is kept, dismissed with a reason, or merged into another.

5. **Verdict.**

   ```
   ### Intent
   > <step 2 paragraph>

   ### Reviewers
   - <label>: <model>, <N> findings

   ### Act on        proven defects that block the PR; the repro, its output, who raised it
   ### Consider      accepted shape findings; the tradeoff
   ### Noted         valid, not actionable now (brief list)
   ### Dismissed     each with a one-line reason
   ### Agreement     where reviewers agreed and diverged
   ```

   Report outcome: stop here.

6. **Apply** (apply outcome only).
   1. **Clean start.** If `git status` shows changes, ask the user to commit them so this pass is its own revertible diff. Record `git diff --shortstat <base>...HEAD`.
   2. **Baseline green.** Find the repo's test, lint and typecheck commands (`AGENTS.md`, `package.json` scripts, CI config) and run the ones covering changed files. Red stops the pass: simplifying on red hides regressions.
   3. **One at a time.** Apply the accepted findings, biggest structural win first, running the fastest check covering the touched file after each. A finding that turns a check red is reverted, not patched around. Finish with the full baseline list green.
   4. **Report:** size before → after (shortstat); applied, one line each; tests deleted or rewritten, with the reason; rejected and reverted, with the reason; open items (untested requirements, scope creep, moves too big for this pass). Leave the changes uncommitted.
