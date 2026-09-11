#!/usr/bin/env bash
set -euo pipefail

# Claude Code WorktreeCreate hook.
# Creates a git worktree, carries over gitignored local config, installs
# dependencies, and runs framework codegen so the tree is usable immediately.
# Input: JSON on stdin with { name, cwd, ... }
# Output: absolute path to worktree on stdout

# Save original stdout for the final path output, redirect everything else to stderr
exec 3>&1 1>&2

INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

WORKTREE_DIR="$CWD/.claude/worktrees/$NAME"

git -C "$CWD" worktree add -b "worktree/$NAME" "$WORKTREE_DIR" HEAD

# Gitignored local config never travels with a worktree, and without it a
# SvelteKit app fails at module load ($env/static/public is missing keys).
# Copy every ignored file named like .env* or *.local.* (e.g. apps/web/.env.local,
# mise.local.toml), keeping its path relative to the repo root. Build output and
# reports are ignored too but never match those names.
echo "Copying gitignored local config into worktree..."
git -C "$CWD" ls-files --others --ignored --exclude-standard -z \
  | while IFS= read -r -d '' rel; do
      base=$(basename "$rel")
      case "$base" in
        .env|.env.*|*.local.*) ;;
        *) continue ;;
      esac
      case "$rel" in
        node_modules/*|*/node_modules/*|.claude/worktrees/*) continue ;;
      esac
      [ -f "$WORKTREE_DIR/$rel" ] && continue
      mkdir -p "$WORKTREE_DIR/$(dirname "$rel")"
      cp -p "$CWD/$rel" "$WORKTREE_DIR/$rel"
      echo "  $rel"
    done

cd "$WORKTREE_DIR"

PM=""
if [ -f bun.lockb ] || [ -f bun.lock ]; then
  PM=bun; bun install
elif [ -f pnpm-lock.yaml ]; then
  PM=pnpm; pnpm install
elif [ -f yarn.lock ]; then
  PM=yarn; yarn install
elif [ -f package-lock.json ]; then
  PM=npm; npm install
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

# SvelteKit generates .svelte-kit/tsconfig.json, which the app tsconfig extends.
# It is gitignored and only produced by `svelte-kit sync` (or a dev/build run), so a
# fresh worktree fails every TS transform in Vite/Storybook until it exists.
if [ -n "$PM" ]; then
  git ls-files -z -- 'svelte.config.*' '*/svelte.config.*' \
    | while IFS= read -r -d '' cfg; do
        dir=$(dirname "$cfg")
        echo "Running svelte-kit sync in $dir..."
        case "$PM" in
          bun)  (cd "$dir" && bunx svelte-kit sync) ;;
          pnpm) (cd "$dir" && pnpm exec svelte-kit sync) ;;
          yarn) (cd "$dir" && yarn svelte-kit sync) ;;
          npm)  (cd "$dir" && npx --no-install svelte-kit sync) ;;
        esac || echo "  svelte-kit sync failed in $dir (continuing)"
      done
fi

# Print worktree path to original stdout (fd 3)
echo "$WORKTREE_DIR" >&3
