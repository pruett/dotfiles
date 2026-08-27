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
skills sync claude-code        # Link every skill into ~/.claude/skills
skills sync codex-cli          # No-op: Codex reads ~/.agents/skills directly
```

For example:

```sh
skills add https://github.com/herdrdev/herdr --skill herdr
```

`skills add` supplies `--global --agent zed --yes` and refreshes the Stow links
automatically.

`zed` is used as the installer target because its global skill directory is the
shared `~/.agents/skills` directory. Run `skills sync <agent>` to create one
relative symlink per skill in an agent-specific location:

- `claude-code` (also `claude`) links into `~/.claude/skills/<skill>`
- `codex-cli` (also `codex` or `openai-codex`) is a no-op because current Codex
  discovers `~/.agents/skills` directly
- `pi` is also a no-op because Pi discovers `~/.agents/skills` directly

Multiple targets may be supplied, such as `skills sync claude codex`. For
agents that need links, existing non-symlink files and directories are never
overwritten. Managed links whose central skills have been removed are cleaned
up during sync.
