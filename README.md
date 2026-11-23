# [~/.\*](https://dotfiles.github.io/)

## New machine setup

On a brand new Mac, run:

```bash
curl -fsSL https://raw.githubusercontent.com/pruett/dotfiles/main/bootstrap | bash
```

The [`bootstrap`](bootstrap) script is idempotent (safe to re-run) and handles everything needed to install these dotfiles *and* push changes back to this repo:

1. Installs Xcode Command Line Tools (which provides `git`)
2. Installs [Homebrew](https://brew.sh/)
3. Clones this repo to `~/.dotfiles` over HTTPS — public, so no auth needed yet (or pulls if already present)
4. Installs all formulae and casks from the [Brewfile](Brewfile) via `brew bundle` (including `gh` and `stow`)
5. Authenticates with GitHub via `gh auth login` (SSH key generated and uploaded for you), then switches the `origin` remote to SSH so you can push
6. Prompts for your git identity and writes it to the gitignored `home/.gitconfig.local`
7. Symlinks every package and links agent skills for Claude Code with `dot link` ([GNU Stow](https://www.gnu.org/software/stow/) underneath), backing up any conflicting existing files to `<file>.pre-dotfiles`

Afterwards, review [MACOS.md](MACOS.md) for the manual System Preferences checklist.

## exe.dev VMs

Dev boxes on exe.dev are declared and deployed with Alchemy from the private `pruett/iac` repo (`infra/exe-dev`). First boot clones this repo, links the agent skills, sets up git and a GitHub key, and joins the tailnet; then `ssh exe-dev-<name>`. This repo keeps only the Mac side: `home/.ssh/config.d/exe-dev` and `tailnet-ssh-known-hosts`.

## Manual pieces (reference)

Everything below is done automatically by `bootstrap`, but documented here for one-off use.

### Homebrew formulae

```bash
$ cd ~/.dotfiles && brew bundle
```

### Managing dotfiles with `dot`

`dot` (`home/.local/bin/dot`) is the one CLI for this repo: it owns all linking into `~`, syncing with GitHub, and agent skills:

```bash
$ dot status   # what's out of date: unlinked files, folded dirs, dangling links
$ dot link     # stow every package, link folded dirs and Claude Code skills, remove dangling links
$ dot sync     # pull, push this machine's commits, link (--boxes: also every exe.dev box)
$ dot skills   # list skills; `dot skills add|update` (see home/.agents/README.md)
$ dot edit     # open this repo in $EDITOR (bare `dot` in zsh also cds here)
```

A package is any top-level directory with tracked files (today just `home`); dot-directories like `.plugins` and `.tools` (CLI projects whose `bin/` is symlinked from `home/.local/bin`) are never stowed. `.stowrc` sets `--no-folding`, so most files get their own link and **a new file needs `dot link`**. The directories in `folded_dirs` (`~/.agents/skills`, `~/.config/zsh`) are instead one symlink to the repo folder, so files added there appear immediately. Edits to existing files never need relinking. Paths in `ignored_paths` (e.g. `.gitconfig.local.sample`) stay in the repo and never get a link.

### Git

`home/.gitconfig` includes the gitignored `~/.gitconfig.local` for your identity and signing keys. `bootstrap` creates it from [`home/.gitconfig.local.sample`](home/.gitconfig.local.sample), which also covers GPG signing setup; to do it by hand:

```bash
$ cp home/.gitconfig.local.sample home/.gitconfig.local && dot link
```

Add SSH/GPG keys to GitHub at https://github.com/settings/keys.

### Cloudflare Tunnel

See [home/.config/cloudflared/README.md](home/.config/cloudflared/README.md). The tunnel runs as a root LaunchDaemon, so it is not stowed; `cloudflared-tunnel install` (needs the gitignored `token.local`) writes it into place, and `cloudflared-tunnel status` checks it end to end.
