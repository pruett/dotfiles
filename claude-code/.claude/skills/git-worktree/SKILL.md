---
name: git-worktree
description: "Use git worktrees for isolated, parallel development. Use when working on features, hotfixes, PR reviews, or exploring multiple approaches in parallel."
---

# Git Worktree

## Setup

Worktrees live in `.claude/worktrees/` at the repo root. Before first use:

```bash
mkdir -p .claude/.worktrees
grep -qxF '.claude/.worktrees/' .gitignore 2>/dev/null || echo '.claude/.worktrees/' >> .gitignore
```

## Naming

| Purpose | Branch | Worktree path |
|---|---|---|
| Feature | `feat/<name>` | `.claude/.worktrees/feat-<name>` |
| Hotfix | `fix/<name>` | `.claude/.worktrees/fix-<name>` |
| Exploration | `explore/<name>-<n>` | `.claude/.worktrees/explore-<name>-<n>` |
| PR review | (existing branch) | `.claude/.worktrees/review-<pr-number>` |

## Priming a New Worktree

After creating a worktree, **always** prime it before doing any work:

1. `cd` into the worktree directory.
2. Detect the package manager and install dependencies:

```bash
cd <worktree-path>

# Detect and install
if [ -f bun.lockb ] || [ -f bun.lock ]; then
  bun install
elif [ -f pnpm-lock.yaml ]; then
  pnpm install
elif [ -f yarn.lock ]; then
  yarn install
elif [ -f package-lock.json ]; then
  npm install
elif [ -f Gemfile.lock ]; then
  bundle install
elif [ -f go.sum ]; then
  go mod download
elif [ -f Cargo.lock ]; then
  cargo fetch
elif [ -f requirements.txt ]; then
  pip install -r requirements.txt
elif [ -f pyproject.toml ]; then
  pip install -e .
fi
```

Do not proceed with any edits or commits until dependencies are installed.

## Rules

1. **Stay in the worktree.** Never `cd` back to main repo to edit.
2. **No destructive ops** (`--force`, `reset --hard`, `branch -D`) on shared branches.
3. **Always clean up** via the Cleanup section.

## Merge Gate

All must pass before merge:

1. Tests, linting, type checks pass in the worktree
2. **code-reviewer** agent run against `git diff main...HEAD` — no unresolved Bug/Likely Bug
3. User explicitly approves

## Merging

Rebase onto main, then merge `--no-ff`:

```bash
cd <worktree-path>
git fetch origin main && git rebase origin/main

cd <repo-root>
git checkout main && git merge --no-ff <branch>
```

## Cleanup

**CRITICAL: Never run `git worktree remove` while cwd is inside the worktree.**
This bricks the shell — no recovery without a new session.

Always chain `cd` first:

```bash
cd <repo-root> && git worktree remove .claude/.worktrees/<name>
git branch -d <branch>
git worktree prune
git worktree list
```

## Exploration

Create N worktrees (`explore/<name>-1`, `-2`, …), work independently, compare. User picks the winner — only it goes through the merge gate. Clean up all.
