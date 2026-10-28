---
name: sync
description: Bring this machine in line with the dotfiles repo (pull, brew, links, agent skills).
disable-model-invocation: true
---

Sync this machine to `~/.dotfiles` `main`. Run every step in order from the repo root; each one is idempotent, so a rerun is always safe. Stop at the first failing step and report its output.

1. **Pull.** `git status --short` must be empty; if it isn't, list the changes and ask whether to commit, stash, or skip the pull. Then `git pull --rebase`. Done when `git status -sb` shows `main...origin/main` with no ahead/behind.
2. **Homebrew.** `brew bundle check --verbose --file=Brewfile`. If anything is missing, `brew bundle install --file=Brewfile`. Done when the check reports the Brewfile's dependencies are satisfied.
3. **Links.** `dot status`; if it exits non-zero, `dot link`. Done when `dot status` exits 0.
4. **Agent skills.** `skills sync claude-code claude-work`. Done when it exits 0.

Report one line per step: what changed, or `already in sync`.
