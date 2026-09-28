#!/usr/bin/env bash
# Claude Code SessionStart hook: give a fresh git worktree its own node_modules.
#
# `claude --worktree` checks a repo out under .claude/worktrees/<name>/ with no
# dependencies. pnpm's store is content-addressable, so a frozen offline install
# there is a ~10s hardlink job, and each worktree owning its node_modules means
# nothing is shared with (or can break) the main checkout.
#
# Acts only when all hold: the session cwd is a *linked* git worktree (not a
# main checkout), it has a pnpm-lock.yaml, and node_modules is missing.
# Stdin is the hook JSON; `.cwd` is the worktree root. Never fails the session.
set -uo pipefail

cwd=$(jq -r '.cwd // empty' 2>/dev/null || true)
cwd=${cwd:-$PWD}

[ -f "$cwd/pnpm-lock.yaml" ] || exit 0
[ -e "$cwd/node_modules" ] && exit 0

git_dir=$(git -C "$cwd" rev-parse --absolute-git-dir 2>/dev/null) || exit 0
common_dir=$(cd "$cwd" && cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P) || exit 0
[ "$(cd "$git_dir" && pwd -P)" != "$common_dir" ] || exit 0

if ! command -v pnpm >/dev/null 2>&1; then
  echo "worktree-install: pnpm not on PATH; run 'pnpm install --frozen-lockfile' in $cwd before building."
  exit 0
fi

log="${TMPDIR:-/tmp}/claude-worktree-install.log"
if (cd "$cwd" && pnpm install --frozen-lockfile --prefer-offline >"$log" 2>&1); then
  echo "worktree-install: installed node_modules in $cwd (pnpm, frozen lockfile)."
else
  echo "worktree-install: pnpm install failed in $cwd; see $log and run 'pnpm install --frozen-lockfile' manually."
fi
exit 0
