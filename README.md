# [~/.\*](https://dotfiles.github.io/)

## New machine setup

On a brand new Mac, run:

```bash
curl -fsSL https://raw.githubusercontent.com/pruett/dotfiles/main/bootstrap | bash
```

The [`bootstrap`](bootstrap) script is idempotent (safe to re-run) and handles everything needed to install these dotfiles *and* push changes back to this repo:

1. Installs Xcode Command Line Tools (which provides `git`)
2. Clones this repo to `~/.dotfiles` over HTTPS — public, so no auth needed yet (or pulls if already present)
3. Runs `dot init`, which installs each **component** in order:
   - Homebrew, then everything in [packages/bundle](packages/bundle) via `brew bundle` (including `gh` and `stow`)
   - GitHub login with `gh auth login` (SSH key generated and uploaded for you), then switches `origin` to SSH so you can push
   - your git identity, written to the gitignored `home/.gitconfig.local`
   - links: every package via [GNU Stow](https://www.gnu.org/software/stow/) plus agent skills for Claude Code, backing up any conflicting file to `<file>.pre-dotfiles`
   - Rex, the terminal, from its own update feed (it isn't in Homebrew)

Afterwards, review [MACOS.md](MACOS.md) for the manual System Preferences checklist.

## exe.dev VMs

Dev boxes on exe.dev are declared and deployed with Alchemy from the private `pruett/iac` repo (`infra/exe-dev`). First boot clones this repo, links the agent skills, sets up git and a GitHub key, and joins the tailnet; then `ssh exe-dev-<name>`. This repo keeps only the Mac side: `home/.ssh/config.d/exe-dev` and `tailnet-ssh-known-hosts`.

## Manual pieces (reference)

Everything below is done by `bootstrap` and `dot init`, but documented here for one-off use.

### Managing this machine with `dot`

`dot` ([`dot/`](dot/README.md), on PATH as `~/.local/bin/dot`) is the one CLI for this repo: setup, updates, checks, packages, linking, syncing and agent skills:

```bash
$ dot init     # install every component (what bootstrap runs); safe to rerun
$ dot update   # pull, then update every component (brew update, upgrades what packages/bundle lists, relink, dot skills update, Rex)
$ dot doctor   # check every component; each ✗/⚠ names the command that fixes it
$ dot components                     # the components, in run order
$ dot package add <name> [cask]      # install and add to packages/bundle; also remove, list, check
$ dot status   # what's out of date: unlinked files, folded dirs, dangling links
$ dot link     # stow every package, link folded dirs and Claude Code skills, remove dangling links
$ dot sync     # pull, push this machine's commits, link (--boxes: also every exe.dev box)
$ dot skills   # list skills; `dot skills add|update` (see home/.agents/README.md)
$ dot edit     # open this repo in $EDITOR (bare `dot` in zsh also cds here)
```

`init`, `update` and `doctor` take `--only a,b` and `--skip a,b`; `init` and `update` take `--dry-run`. To add something `dot` should install and check, add a component ([dot/README.md](dot/README.md#add-a-component)).

A package is any top-level directory with tracked files (today just `home`; `dot/` and `packages/` are never stowed); dot-directories like `.plugins` and `.tools` (CLI projects whose `bin/` is symlinked from `home/.local/bin`) are never stowed. `.stowrc` sets `--no-folding`, so most files get their own link and **a new file needs `dot link`**. Git hooks in `.githooks` (turned on by `dot link`, which sets `core.hooksPath`) run it for you after a pull, merge, rebase or branch checkout that adds, removes or renames files under `home/`. The directories in `folded_dirs` (in `dot/lib/links.sh`) (`~/.agents/skills`, `~/.config/zsh`) are instead one symlink to the repo folder, so files added there appear immediately. Edits to existing files never need relinking. Paths in `ignored_paths` (e.g. `.gitconfig.local.sample`) stay in the repo and never get a link.

### Git

`home/.gitconfig` includes the gitignored `~/.gitconfig.local` for your identity and signing keys. `dot init` creates it from [`home/.gitconfig.local.sample`](home/.gitconfig.local.sample), which also covers GPG signing setup; to do it by hand:

```bash
$ cp home/.gitconfig.local.sample home/.gitconfig.local && dot link
```

Add SSH/GPG keys to GitHub at https://github.com/settings/keys.

### Cloudflare Tunnel

See [home/.config/cloudflared/README.md](home/.config/cloudflared/README.md). The tunnel runs as a root LaunchDaemon, so it is not stowed; `cloudflared-tunnel install` (needs the gitignored `token.local`) writes it into place, and `cloudflared-tunnel status` checks it end to end.
