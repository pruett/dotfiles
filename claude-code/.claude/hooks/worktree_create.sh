#!/usr/bin/env bash
set -euo pipefail

# Creates a git worktree and installs dependencies.
# Input: JSON on stdin with { name, cwd, ... }
# Output: absolute path to worktree on stdout

# Save original stdout for the final path output, redirect everything else to stderr
exec 3>&1 1>&2

INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

WORKTREE_DIR="$CWD/.claude/worktrees/$NAME"

git -C "$CWD" worktree add -b "worktree/$NAME" "$WORKTREE_DIR" HEAD

cd "$WORKTREE_DIR"

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

# Print worktree path to original stdout (fd 3)
echo "$WORKTREE_DIR" >&3
