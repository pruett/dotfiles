# Global agent skills

Skills live in this dotfiles package so GNU Stow exposes them at
`~/.agents/skills`, which Pi discovers automatically. The adjacent
`.skill-lock.json` is managed by the `skills` CLI.

The `~/.local/bin/skills` wrapper runs the upstream CLI against this package's
`home/` directory and refreshes the Stow links after updates:

```sh
skills add <source> [options]  # Add from a path, URL, or GitHub repository
skills list                    # List skills with short description snippets
skills update                  # Update every lockfile-managed skill
skills update herdr            # Update one skill
skills restow                  # Refresh Stow links, including skill directory links
skills sync claude-code        # Link every skill into ~/.claude/skills
skills sync codex-cli          # No-op: Codex reads ~/.agents/skills directly
```

For example:

```sh
skills add https://github.com/herdrdev/herdr --skill herdr
```

`skills add` supplies `--global --agent zed --yes` and refreshes the Stow links
automatically.

The repository's `.stowrc` uses `--no-folding` for normal dotfiles. Codex skips
symlinked `SKILL.md` files, so the wrapper makes a second Stow pass that links
whole skill directories instead. Bootstrap uses the same refresh. After adding
skills manually or running `stow -R home`, run `skills restow` to restore this layout.
Skill sources stay in `home/.agents/skills`; only the links in your home directory
change. The refresh cleans up stale Stow links and empty directories left behind
by Stow, preserving unrelated files.

Hand-written skills (not in the lockfile) live here too, e.g. `orchestrate`,
`explain-pr`, `visual-pr`, `cull-tests` and `verify-suppco`. A skill that ships a CLI exposes it
through a relative symlink in `home/.local/bin` (`verify-suppco -> ../../.agents/skills/verify-suppco/bin/verify-suppco`)
so Stow puts it on `PATH`; after adding one, run `skills sync claude claude-work`
to create the agent links. `verify-suppco`'s `bin/` is only a
forwarder: the CLI, its tests and feature map live in `~/personal/verify-suppco`
(`packages/cli/`, github.com/pruett/verify-suppco) next to its GUI, and the shim
prints the clone command when that checkout is missing.

`zed` is used as the installer target because its global skill directory is the
shared `~/.agents/skills` directory. Run `skills sync <agent>` to create one
relative symlink per skill in an agent-specific location:

- `claude-code` (also `claude`) links into `~/.claude/skills/<skill>`
- `codex-cli` (also `codex` or `openai-codex`) is a no-op because current Codex
  discovers `~/.agents/skills` directly
- `pi` is also a no-op because Pi discovers `~/.agents/skills` directly. The
  upstream CLI still auto-detects Pi and links updated skills into
  `~/.pi/agent/skills`; the wrapper prunes those redundant links after `add`
  and `update`.

Multiple targets may be supplied, such as `skills sync claude codex`. For
agents that need links, existing non-symlink files and directories are never
overwritten. Managed links whose central skills have been removed are cleaned
up during sync.
