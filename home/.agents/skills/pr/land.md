# Land: merge, then clean up

The request said merge, land or ship. Anything less stops at babysit.

1. **Merge-ready gate.** `gh pr view <n> --json mergeStateStatus,reviewDecision` and `gh pr checks <n>`. Red checks, unresolved threads or conflicts send you to [`babysit.md`](babysit.md) in `drive` mode first; "merge when green" means wait there, not fail. A "hold" anywhere in the conversation stops here. Done when `mergeStateStatus` is `CLEAN`.

2. **Verified, not just green.** Green CI is an input, not a verdict. A PR that changes user-facing behavior needs evidence an agent other than its author produced by running the change: a verify-skill run (such as `verify-suppco`), a reviewer verdict, or the user's own sign-off in this conversation. Missing evidence for behavior work: say so in one line and ask before merging. Tooling, docs and test-only PRs pass this step.

3. **Merge.** `gh pr merge <n> --squash --delete-branch` (or the repo's merge method). A stack merges bottom-up, one PR at a time: after each merge, retarget the next PR to trunk (`gh pr edit <next> --base <trunk>`), rebase it onto trunk, push with `--force-with-lease`, and repeat this step once its checks pass. Read each merge back with `gh pr view <n> --json state,mergedAt,baseRefName`; a queued or auto-merge request is not a merge. Done when state reads `MERGED` with trunk as its base.

4. **Ticket.** If the PR links a Linear ticket and the merge did not move it, set it to the team's done state.

5. **Clean up.** Skip a piece the user asked to keep.
   - Worktree: `wt rm <repo>/<slug>` (worktrees skill) when the branch lived in one.
   - Herdr: close the tabs or workspace this PR's agents ran in (herdr skill).
   - Local branch: delete it if it remains.

6. **Report** one line: what merged (link), what was cleaned up, and anything left.
