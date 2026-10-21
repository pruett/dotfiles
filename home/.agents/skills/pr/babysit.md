# Babysit: comments, conflicts and CI to merge-ready

Follow pstack's Babysit playbook, `~/.agents/skills/poteto-mode/playbooks/babysit.md`, with the overrides below. Its scripts and references resolve from `~/.agents/skills/poteto-mode/`; the watcher is `~/.agents/skills/poteto-mode/scripts/watch-pr/watch-pr` (bun, installs its own deps on first run).

## Modes

Declare one before the first poll:

| the user says | mode |
|---|---|
| address the comments, bugbot flagged, resolve the feedback | `threads-only` |
| get it green, babysit, merge-ready, fix CI | `drive` |
| check on PR N, is it green, anything outstanding | `check` (`watch-pr --status-only --pretty`) |
| a plan is still running and you should not block | `background` |

## Overrides for this user

- **Every thread ends resolved.** Triage each per `poteto-mode/references/bugbot-triage.md`:
  - a real bug: fix it with a red-first test, push, reply with one sentence citing the commit, resolve;
  - a false flag or noise: reply with one sentence of concrete disproof, resolve.

  Resolve with `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread node id>`; list thread ids with the `reviewThreads` field of `gh api graphql` on the PR.
- **Single PRs rebase themselves.** A lone PR (no stack above it) that conflicts with its base: rebase on `origin/<base>`, resolve mechanical conflicts, push with `--force-with-lease`. A non-mechanical conflict, or any PR in a stack, gets the playbook's report-and-stop.
- **`/loop` drives `drive`.** Run it with `/loop` in dynamic mode, waking on watcher output, as the playbook says.
- **Hand-off.** At merge-ready, report in three lines: checks, threads resolved (fixed / dismissed counts), anything waiting on a human. When the original request also asked to merge ("then merge when green"), continue to [`land.md`](land.md).
