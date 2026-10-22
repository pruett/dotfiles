---
name: worktrees
description: "Make, find, remove and prune git worktrees with the `wt` CLI. Use when work in a repo needs its own checkout (a branch, a parallel agent, a PR to review), when asked to list or clean up worktrees or merged branches, or before any `git worktree add`."
---

# Worktrees

`wt` (on `PATH`; its source is [`scripts/wt`](scripts/wt), run that when `wt` is missing) manages worktrees for the repos its config allows. Worktrees live **beside** the repos, never inside them, and `wt new` makes each one ready to run: it copies the repo's gitignored essentials, trusts mise and runs the repo's setup command. A bare `git worktree add` skips all of that.

## Learn the current CLI

`wt help` and `wt <verb> --help` are the contract: the layout, the allowed repos (`wt help config`), every verb and flag. Read the help of each verb before you first use it. stdout is data only (a path, or `ls` rows); progress goes to stderr. Exit 2 means bad usage or a precondition, exit 1 means a step failed, and every non-zero exit prints a `fix:` line. Run that line, unless it discards work (`--force`, `prune --yes`): those need the user's go-ahead.

## Check the repo is allowed

Run `wt ls --no-pr` from inside the repo. Exit 2 with "not inside an allowed repo" means `wt` does not manage it. Use plain `git worktree` there, or ask the user whether to add the repo to the config.

## Make one

- Run `wt new <slug>` from inside the repo, or `wt new <repo>/<slug>` from anywhere. Use `--branch` to check out a branch that exists, for example to review a PR.
- The only stdout line is the worktree path. `cd` into it before any other command: tools resolve the repo from the cwd.
- The `note` lines that `wt new` prints are that repo's rules for working in the worktree (how to run tests, which ports are taken). Follow them. `wt info` prints them again, from inside the worktree.
- **Stacked work:** `--base` resolves in the main checkout, so `--base HEAD` means the *main checkout's* HEAD. To branch from the worktree you are in, pass the commit: `--base "$(git rev-parse HEAD)"`.
- Name the slug `<ticket>-<few-words>` when a ticket exists. The slug becomes the folder name and the branch suffix.

## When setup fails

The config, [`config`](config) in this skill (or `~/.config/wt/config` when that file exists, or `$WT_CONFIG`), decides how each repo's worktrees are stood up: which local files are copied (`include`), per-worktree variables (`env`), the commands run in order (`setup`) and before removal (`teardown`), and the rules for working there (`note`). `wt info <repo>` prints the entries that apply; `wt help config` explains each key.

When `wt new` exits 1, the worktree exists and its path is still printed, but setup stopped at the failed entry. Read the log the error names, fix the cause, then run `wt setup <repo>/<slug>`: it re-applies every entry in order and keeps files already in the worktree. When the entry itself is wrong (a stale command, a missing include file), the fix belongs in the config: show the user the entry and your proposed change, and edit it only on their word.

## Clean up

- Remove what you made: `wt rm <repo>/<slug>`. It refuses uncommitted changes, and keeps the branch when it has commits.
- Claude Code does not remove a subagent's worktree when the subagent finishes. When you have merged or discarded its work, run `wt rm <repo>/<slug>`.
- `wt prune` with no flags is a dry run. Show its list to the user. `prune --yes` also deletes the origin branches, so run it only on their word.
- `wt ls` marks worktrees in other layouts as `(outside)`. Only the user decides whether to move them (`git worktree move`) or remove them.

## Open one in Herdr

Only when the user asks for a Herdr tab or workspace: make the worktree with `wt new`, then load the `herdr` skill and open the printed path with `herdr worktree open --path <path>`. `herdr worktree create` skips the copy and the setup.
