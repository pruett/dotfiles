# Global agent skills

Skills live in this dotfiles package so GNU Stow exposes them at
`~/.agents/skills`, which Pi discovers automatically. The adjacent
`.skill-lock.json` is managed by the `skills` CLI.

The `~/.local/bin/skills` wrapper runs the upstream CLI against this package's
`home/` directory and refreshes the Stow links after updates:

```sh
skills add <source> [options]  # Add from a path, URL, or GitHub repository
skills list                    # List centrally managed skills
skills update                  # Update every lockfile-managed skill
skills update herdr            # Update one skill
```

For example:

```sh
skills add https://github.com/herdrdev/herdr --skill herdr
```

`skills add` supplies `--global --agent zed --yes` and refreshes the Stow links
automatically.

`zed` is used as the installer target because its global skill directory is the
shared `~/.agents/skills` directory. Each installed skill can then be linked
from agent-specific locations:

- `~/.claude/skills/<skill>` for Claude Code
- `~/.pi/agent/skills/<skill>` for Pi

For `herdr`, both links point back to `home/.agents/skills/herdr` as the single
source of truth.
