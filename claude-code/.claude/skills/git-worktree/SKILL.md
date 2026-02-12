---
name: git-worktree
description: "Manage git worktrees for isolated, parallel development. Use when executing from a plan, working on features, hotfixes, PR reviews, or exploring multiple approaches in parallel."
---

# Git Worktree

## Setup

Worktrees live in `.worktrees/` at the repo root (gitignored). Before first use:

```bash
mkdir -p .worktrees
grep -qxF '.worktrees/' .gitignore 2>/dev/null || echo '.worktrees/' >> .gitignore
```

## Naming

| Purpose | Branch | Worktree path |
|---|---|---|
| Feature | `feat/<name>` | `.worktrees/feat-<name>` |
| Hotfix | `fix/<name>` | `.worktrees/fix-<name>` |
| Exploration | `explore/<name>-<n>` | `.worktrees/explore-<name>-<n>` |
| PR review | (existing branch) | `.worktrees/review-<pr-number>` |

## Rules

1. **Stay in the worktree.** Never `cd` back to the main repo to make edits.
2. **No destructive operations** (`--force`, `reset --hard`, `branch -D`) on shared branches.
3. **Always clean up** after merge or discard: `git worktree remove` + `git branch -d` + `git worktree prune`.

## Merge Gate

A worktree branch may only merge after ALL pass:

1. Tests, linting, and type checks pass inside the worktree
2. Run the **code-reviewer** agent against the worktree branch diff (`git diff main...HEAD`)
3. No unresolved Bug or Likely Bug findings
4. User explicitly approves the merge

## Exploration with multiple worktrees

Create N worktrees (`explore/<name>-1`, `-2`, etc.), work independently in each, compare results. User picks the winner — only it goes through the merge gate. Clean up all of them.
