---
name: pr-review
description: Isolate a PR's branch in its own worktree, read the whole PR, triage the adversarial review in its latest comment, push back, and clean up.
disable-model-invocation: true
---

# PR review

`/pr-review <n>` puts the session in a worktree for PR `<n>`, with the whole PR read and its latest adversarial review triaged. A background loop is committing on trunk throughout; every command here leaves other worktrees alone.

## 1. Resolve the PR

`gh pr view <n> --json number,title,state,headRefName,url,body`

Open PRs only — otherwise stop, show `gh pr list --state open`, and ask which one they meant. When `gh` cannot work out the repo (an SSH host alias in `origin` hides it), prefix `GH_REPO=<owner>/<repo>`.

`<branch>` is the head branch from here on.

## 2. Worktree

```
git worktree prune                     # clears stale registrations
git fetch origin <branch>
git worktree list --porcelain          # first entry is <main>; `branch refs/heads/…` shows what is held
```

`<path>` is `<main>/.claude/worktrees/pr-review-<n>`. If `git check-ignore -q .claude/worktrees` fails, add `.claude/worktrees/` to `<main>/.git/info/exclude`.

**Free** — no worktree holds `<branch>`:

```
git worktree add <path> <branch>                             # local branch exists (plain, no -b)
git worktree add --track -b <branch> <path> origin/<branch>  # it does not
```

**Held** — another worktree has `<branch>` checked out. Branch off the PR head under a name of your own, which always succeeds and leaves that worktree untouched:

```
git worktree add -b pr-review/<n> <path> origin/<branch>
```

**Exists** — `pr-review-<n>` is already registered. Reuse it when `git -C <path> status --porcelain` is empty; otherwise report what is in there and ask before removing.

Then `EnterWorktree` at `<path>`.

Done when `git worktree list` shows the session's cwd at `pr-review-<n>` and `git -C <path> rev-parse --abbrev-ref '@{upstream}'` resolves.

## 3. Read the PR whole

- The body from step 1.
- `gh pr diff <n>` — and the surrounding code in the worktree wherever the diff alone does not say what the change does to the system.
- `gh pr view <n> --comments` — every comment and review thread, oldest to newest.

Done when every changed file and every comment thread is accounted for.

## 4. Triage the latest adversarial review

Branch on the latest comment: if it carries adversarial review findings, work each one; otherwise skip to the hand-back.

Per finding, try to **refute** it against the code in the worktree — trace the actual path, name the inputs that would trigger it. A finding survives only when you can state the concrete failure it causes; one that reads plausible but does not reproduce is refuted.

Then, put the surviving findings to the user, asking: which should I fix now? Report the refuted ones in a line each — the claim and what refutes it — and fix nothing without being asked.

## 5. Push back

On request. `git fetch origin <branch>` first — the loop may have pushed meanwhile; if the remote moved ahead, `git rebase origin/<branch>`, then push. Force-pushing waits for the user to ask for it by name.

| Step 2 path | Push with |
| --- | --- |
| Free | `git push` |
| Held | `git push origin HEAD:<branch>` |

## 6. Clean up

When the user is done with the PR.

Agent:

1. `git -C <path> status --porcelain` empty, `git -C <path> rev-list --count @{upstream}..HEAD` zero — otherwise stop and report the stranded work.
2. `ExitWorktree`, then `git worktree remove <path>`.
3. Held path only: `git branch -d pr-review/<n>`, then re-sync local `<branch>` with `git fetch origin <branch>:<branch>`. When a worktree holds that branch the command fails by design — `refusing to fetch into branch '<branch>' checked out at '<other>'` — so leave it and hand the human the line below. Free path is already current.

Human — end with whichever still applies, one line each:

- `git -C <other-worktree> merge --ff-only origin/<branch>` — run between loop iterations, or skip it if the loop fetches each pass.
- Stranded work in `pr-review-<n>`: push it or discard it.

Done when `git worktree list` shows no `pr-review-<n>` and `git branch --list 'pr-review/*'` is empty.

## Hand back

`I've read PR <#>, how can I help?` — plus the step 5 push command when step 2 took the **Held** path.
