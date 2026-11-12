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
skills sync                    # Link every skill into ~/.claude/skills
```

For example:

```sh
skills add https://github.com/herdrdev/herdr --skill herdr
```

`skills add` supplies `--global --agent zed --yes`.

Codex skips symlinked `SKILL.md` files, which is why `dot` links
`~/.agents/skills` as one directory symlink rather than file by file.

Hand-written skills (not in the lockfile) live here too, e.g. `orchestrate`,
`pr` and `worktrees`. A skill that ships a CLI keeps it inside the skill, so
copying the skill folder carries everything: the code in `scripts/`, its
default config beside it, and a relative symlink in `home/.local/bin` pointing
at the script so Stow puts it on `PATH` (`worktrees` is the example). After
adding one, run `dot link` for the CLI and `skills sync`
to create the Claude Code links.

pstack skills come from the Claude Code copy
(`https://github.com/cursor/plugins/tree/main/harness/pstack/claude-code`), never
the Cursor copy at `pstack/`. They link to an adapter at
`../../docs/harness/claude-code.md`; `docs/` here holds a copy, and
`~/.claude/docs` links to it so the path resolves. Refresh the copy when `skills update` changes pstack.

`zed` is used as the installer target because its global skill directory is the
shared `~/.agents/skills` directory. Run `skills sync` to create one relative
symlink per skill in `~/.claude/skills/<skill>` (not in this repo, since Claude
Code writes its own files there).

Codex and Pi need no sync. The upstream CLI still auto-detects Pi and links
updated skills into `~/.pi/agent/skills`; the wrapper prunes those redundant
links after `add` and `update`.

Existing non-symlink files and directories are never overwritten. Managed links whose central skills have been removed are cleaned
up during sync.

Skills bundled in a plugin under `.plugins/<plugin>/skills/` keep their real files there. Every `skills` command except
`help` first links them into `home/.agents/skills`; run `skills sync`
once after adding one.
