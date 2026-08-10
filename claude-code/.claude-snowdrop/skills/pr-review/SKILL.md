---
name: pr-review
description: Land in a worktree on a PR's branch, having read the whole PR, and triage any adversarial review sitting in its latest comment.
disable-model-invocation: true
---

# PR review

`/pr-review <n>` ends with the session sitting in a worktree on PR `<n>`'s branch, the whole PR read, and its latest adversarial review either triaged or absent.

## 1. Resolve the PR

`gh pr view <n> --json number,title,state,headRefName,url,body`.

The number must resolve to an **open** PR. If it does not — closed, merged, no such number — stop, show `gh pr list --state open`, and ask which one they meant.

When `gh` cannot work out the repo (an SSH host alias in `origin` hides it), prefix the command with `GH_REPO=<owner>/<repo>`.

## 2. Worktree on the PR's branch

The PR's `headRefName` becomes a local branch of the same name in a worktree under the **main** worktree's `.claude/worktrees/` (the first entry of `git worktree list`), named `pr-<n>`:

```
git fetch origin <headRefName>
git worktree add <main>/.claude/worktrees/pr-<n> --track -b <headRefName> origin/<headRefName>
```

If the branch already exists locally, drop `--track -b` and pass the branch name alone. If a worktree already holds that branch, reuse it.

Then enter it: `EnterWorktree` with `path` set to that worktree, so the rest of the session runs there.

Done when `git worktree list` shows the session's cwd on `<headRefName>`.

## 3. Read the PR whole

- The body from step 1.
- `gh pr diff <n>` — and the surrounding code in the worktree wherever the diff alone does not say what the change does to the system.
- `gh pr view <n> --comments` — every comment and review thread, oldest to newest.

Done when every changed file and every comment thread is accounted for.

## 4. Triage the latest adversarial review

Branch on the latest comment: if it carries adversarial review findings, work each one; otherwise skip to the hand-back.

Per finding, try to **refute** it against the code in the worktree — trace the actual path, name the inputs that would trigger it. A finding survives only when you can state the concrete failure it causes; one that reads plausible but does not reproduce is refuted.

Then, in one `AskUserQuestion`, put the surviving findings to the user as a multi-select: which should I fix now? Report the refuted ones in a line each — the claim and what refutes it — and fix nothing without being asked.

## Hand back

With no findings to put to the user, the whole reply is:

`I've read PR <#>, how can I help?`
