# Ship: comments, conflicts and CI to merge-ready, then merge if asked

Get one PR to merge-ready: no conflicts, every review thread resolved, checks green. Merge only when the request said merge, land or ship.

## Modes

Declare one before the first look:

| the user says | mode | does |
|---|---|---|
| check on PR N, is it green, anything outstanding | `check` | one status read, report, stop |
| address the comments, bugbot flagged, resolve the feedback | `threads-only` | steps 2–3, touches nothing else |
| get it green, babysit, merge-ready, fix CI | `drive` | steps 1–7, looping until merge-ready |
| merge, land, ship, merge when green | `land` | steps 1–6, then 8–11 |

Nothing named defaults to `drive`; a small or docs-only PR gets `check`. A "hold" anywhere in the conversation never reaches step 8.

## Commands

- Status: `gh pr view <n> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup` and `gh pr checks <n>`.
- Threads (ids, resolved state, comments):
  ```bash
  gh api graphql -F o=<owner> -F r=<repo> -F n=<n> -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:20){nodes{author{login} body url}}}}}}}'
  ```
- Reply: write the reply to `<scratchpad>/reply.md`, then
  `gh api graphql -F id=<thread id> -F body=@<scratchpad>/reply.md -f query='mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{url}}}'`.
  Never put comment or reply text inside a shell command.
- Resolve: `gh api graphql -F id=<thread id> -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}'`.

## To merge-ready

1. **Conflicts first.** A PR with nothing stacked on it that conflicts with its base: `git fetch origin && git rebase origin/<base>`, resolve mechanical conflicts, push with `--force-with-lease`. A conflict that needs a judgment call, or a PR in a stack, gets reported (which branch needs the rebase) and the loop stops.

2. **Triage every unresolved thread** against the code.
   - **fix**: a plausible bug in correctness, security, data, auth, billing, migrations, idempotency or races. Fix it with a test that fails first, in the PR that owns the code.
   - **dismiss**: the code already disproves it (an invariant, a type, a later commit in this PR, usage elsewhere in the stack). No code churn just to quiet a bot.
   - **ask**: novel, high-severity, or touching security, auth, billing, data or migrations and you are not sure. Ask the user; never dismiss these yourself.

3. **Push, then reply and resolve.** Batch all fixes into one push. Then reply to each thread in one sentence (the commit SHA for a fix, the concrete disproof for a dismissal) and resolve it. Every thread ends resolved except the ones waiting on the user.

4. **CI.** For each red check, read the log (`gh run view <run id> --log-failed`) and classify it:
   - Failure in code the diff changed: commit a fix.
   - Failure in code the diff never touches: check for a stale base (`git merge-base --is-ancestor origin/<base> HEAD`); stale means rebase per step 1.
   - Flake or infrastructure: one rerun (`gh run rerun <run id> --failed`). A second identical failure is not a flake; read the logs again.

5. **Ready for review.** Once every check is green, a draft PR goes ready: `gh pr ready <n>`. Review bots (Bugbot, Seer, Devin) skip drafts, so this is what starts them; expect new threads and keep looping. Stay draft only when the user asked to keep it draft in this conversation.

6. **Loop.** Run `drive` under `/loop` in dynamic mode. After each push, start `gh pr checks <n> --watch` in the background and wake when it exits; then re-read status and threads (bots post new threads after CI and after the PR goes ready). Answer user questions mid-loop and continue. Done when the PR is not a draft, `mergeStateStatus` is `CLEAN` (or only `BLOCKED` on a human approval) and no thread is unresolved.

   Not landing: report in three lines (checks, threads resolved as fixed / dismissed counts, anything waiting on a human).

7. **Alert stakeholders (optional).** Ask the user whether to ask product or design for feedback before merging. On yes, write one line ready to post: `@stakeholder`, what changed in product words, and the preview URL for the head commit (the Vercel bot's PR comment, or `gh api "repos/<owner>/<repo>/deployments?sha=<head sha>"` → `statuses_url` → `environment_url`). Post it to the linked Linear ticket (`save_comment`) or Slack only after the user approves that exact text; otherwise hand it over to paste. Stop.

## Land

8. **Verified, not just green.** A PR that changes user-facing behavior needs evidence an agent other than its author produced by running the change: a verify-skill run (such as `verify-suppco`), a reviewer verdict, or the user's own sign-off in this conversation. Missing evidence for behavior work: say so in one line and ask before merging. Tooling, docs and test-only PRs pass this step.

9. **Merge.** `gh pr merge <n> --squash --delete-branch` (or the repo's merge method). A stack merges bottom-up, one PR at a time: after each merge, retarget the next PR to trunk (`gh pr edit <next> --base <trunk>`), rebase it onto trunk, push with `--force-with-lease`, and merge it once its checks pass. Read each merge back with `gh pr view <n> --json state,mergedAt,baseRefName`; a queued or auto-merge request is not a merge. Done when state reads `MERGED` with trunk as its base.

10. **Ticket and clean up.** If the PR links a Linear ticket the merge did not move, set it to the team's done state. Then, skipping anything the user asked to keep, with the `worktrees` skill:
   - `cd` to the repo's main checkout, then `git switch <trunk> && git pull --ff-only`.
   - `wt rm <repo>/<slug> --delete-branch`. The merge is already read back as `MERGED`, and a squash merge leaves the branch looking unmerged, so the flag is needed. Exit 2 for uncommitted changes: show `git -C <path> status --short` and ask; never `--force` on your own.
   - `git worktree prune` to drop records of worktree folders that no longer exist.
   - `wt prune` (dry run) and show its list to the user. Run `wt prune --yes` only on their word: it also deletes origin branches.
   - Close this PR's Herdr tabs (herdr skill).
   Done when `wt ls` no longer shows the slug and `git branch --list <branch>` prints nothing.

11. **Report** one line: what merged (link), what was cleaned up, and anything left.
