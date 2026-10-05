# Global agent skills

Skills live in this dotfiles package so GNU Stow exposes them at
`~/.agents/skills`, which Codex and Pi discover directly. The adjacent
`.skill-lock.json` is managed by the `skills` CLI.

The `~/.local/bin/skills` wrapper runs the upstream CLI against this package's
`home/` directory. It only edits skills; linking into `~` is `dot`'s job (see the
root README). `~/.agents/skills` is a single symlink to this folder, so added
and updated skills appear immediately:

```sh
skills add <source> [options]  # Add from a path, URL, or GitHub repository
skills list                    # List skills with short description snippets
skills update                  # Update every lockfile-managed skill
skills update herdr            # Update one skill
skills sync claude-code        # Link every skill into ~/.claude/skills
skills sync claude-work        # Link every skill into ~/.claude-work/skills
```

For example:

```sh
skills add https://github.com/herdrdev/herdr --skill herdr
```

`skills add` supplies `--global --agent zed --yes`.

Codex skips symlinked `SKILL.md` files, which is why `dot` links
`~/.agents/skills` as one directory symlink rather than file by file.

Hand-written skills (not in the lockfile) live here too, e.g. `orchestrate`,
`explain-pr`, `visual-pr` and `verify-suppco`. A skill that ships a CLI exposes it
through a relative symlink in `home/.local/bin` (`verify-suppco -> ../../.agents/skills/verify-suppco/bin/verify-suppco`)
so Stow puts it on `PATH`; after adding one, run `dot link` for the CLI and `skills sync claude claude-work`
to create the agent links. `verify-suppco`'s `bin/` is only a
forwarder: the CLI, its tests and feature map live in `~/personal/verify-suppco`
(`packages/cli/`, github.com/pruett/verify-suppco) next to its GUI, and the shim
prints the clone command when that checkout is missing.

`zed` is used as the installer target because its global skill directory is the
shared `~/.agents/skills` directory. Run `skills sync <agent>` to create one
relative symlink per skill directly in the agent's skills folder in `~` (not in
this repo, since Claude Code writes its own files there):

- `claude-code` (also `claude`) links into `~/.claude/skills/<skill>`
- `claude-work` (also `work`) links into `~/.claude-work/skills/<skill>`

Codex and Pi need no sync. The upstream CLI still auto-detects Pi and links
updated skills into `~/.pi/agent/skills`; the wrapper prunes those redundant
links after `add` and `update`.

Multiple targets may be supplied, such as `skills sync claude claude-work`.
Existing non-symlink files and directories are never overwritten. Managed links whose central skills have been removed are cleaned
up during sync.

Skills bundled in a plugin under `.plugins/<plugin>/skills/` (e.g. `weed-tests`
in `.plugins/devin`) keep their real files there. Every `skills` command except
`help` first links them into `home/.agents/skills`; run `skills sync claude
claude-work` once after adding one.
