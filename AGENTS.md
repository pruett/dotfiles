# Dotfiles

Kevin's macOS setup, plus the agent skills that exe.dev boxes share. `home/`
mirrors `~` and is linked into it with GNU Stow; `dot` (`dot/README.md`) sets
up, updates and checks the machine. `dot help` lists every command.

## Where to look

| Task | Location |
|------|----------|
| Something `dot` installs, updates or checks (tool, app, setting) | New component: `dot/lib/components/<name>.sh`, plus its name in `component_order` in `dot/lib/components.sh` (`dot/README.md#add-a-component`) |
| Add or remove a Homebrew package | `dot package add <name> [cask]` / `dot package remove <name>`; they edit `packages/bundle` and install in one step |
| Any config file | `home/<path as under ~>`, e.g. `home/.config/rex/init.lua` |
| Agent skill | `home/.agents/skills/<name>/SKILL.md` (`home/.agents/README.md`); third-party ones via `dot skills add` |
| A CLI that belongs to a skill | `home/.agents/skills/<name>/scripts/<cli>`, with a relative symlink to it in `home/.local/bin/` |
| Claude Code settings, hooks, global instructions | `home/.claude/` (`CLAUDE.md` there is the global one, for every project) |
| Shell | `home/.zshenv`, `home/.zshrc`, `home/.config/zsh/` (`extras/` sourced, `functions/` autoloaded) |
| Git | `home/.gitconfig`; identity and signing keys in the gitignored `home/.gitconfig.local` |
| Linking rules (folded or ignored paths) | `folded_dirs` and `ignored_paths` in `dot/lib/links.sh` |
| Manual macOS settings | `MACOS.md` |

## Working in this repo

- Edit files under `home/`. The files in `~` are symlinks into it, so an edit
  through `~` lands here too; an app that replaces a symlink with a real file
  has taken the file out of the repo (`dot status` shows it).
- Stow links file by file (`.stowrc` sets `--no-folding`), so a **new** file
  under `home/` needs `dot link`: run it after adding, renaming or deleting a
  file, and after a plain `git pull` (`dot update` and `dot sync` relink
  for you). `~/.agents/skills` and `~/.config/zsh` are single directory
  links, so files added there show up at once.
- Top-level `dot/`, `packages/` and dot-directories (`.plugins/`) stay in the
  repo and are never linked into `~`.
- `dot` runs on the stock macOS `/bin/bash` 3.2: no `mapfile`, no associative
  arrays, and expand arrays that may be empty as `${a[@]+"${a[@]}"}`. Check
  changes with `shellcheck` from `dot/` (it reads `dot/.shellcheckrc`).
- exe.dev boxes run `dot sync` every 10 minutes and only get the agent skills
  and their CLIs. Commit to `main`; boxes pull it from there.
- Finish with `dot doctor`: every ✗ or ⚠ line names the command that fixes it.
