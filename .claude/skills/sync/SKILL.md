---
name: sync
description: Bring this machine in line with the dotfiles repo (pull, brew, links).
disable-model-invocation: true
---

Sync this machine to `~/.dotfiles` `main`. Run every step in order from the repo root; each one is idempotent, so a rerun is always safe. Stop at the first failing step and report its output.

1. **Pull.** `git status --short` must be empty; if it isn't, list the changes and ask whether to commit, stash, or skip the pull. Then `git pull --rebase`. Done when `git status -sb` shows `main...origin/main` with no ahead/behind.
2. **Homebrew.** `dot package check`. If anything is missing, `dot init --only packages`. Done when the check reports packages/bundle's dependencies are satisfied.
3. **Links.** `dot status`; if it exits non-zero, `dot link` (this also links agent skills for Claude Code). Done when `dot status` exits 0.

Report one line per step: what changed, or `already in sync`.
