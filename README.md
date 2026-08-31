# [~/.\*](https://dotfiles.github.io/)

## New machine setup

On a brand new Mac, run:

```bash
curl -fsSL https://raw.githubusercontent.com/pruett/dotfiles/main/bootstrap | bash
```

The [`bootstrap`](bootstrap) script is idempotent (safe to re-run) and handles everything needed to install these dotfiles *and* push changes back to this repo:

1. Installs Xcode Command Line Tools
2. Installs [Homebrew](https://brew.sh/)
3. Installs core tools (`git`, `gh`, `stow`)
4. Authenticates with GitHub via `gh auth login` (SSH key generated and uploaded for you)
5. Clones this repo to `~/.dotfiles` over SSH (or pulls if already present)
6. Installs all formulae from the [Brewfile](Brewfile) via `brew bundle`
7. Prompts for your git identity and writes it to the gitignored `git/.gitconfig.local`
8. Symlinks every package with [GNU Stow](https://www.gnu.org/software/stow/), backing up any conflicting existing files to `<file>.pre-dotfiles`

Afterwards, review [MACOS.md](MACOS.md) for the manual System Preferences checklist.

## Manual pieces (reference)

Everything below is done automatically by `bootstrap`, but documented here for one-off use.

### Homebrew formulae

```bash
$ cd ~/.dotfiles && brew bundle
```

### Dotfile symlinks with `stow`

```bash
# Loop over directories and run `stow` to enable respective dotfile symlinking
$ cd ~/.dotfiles && find . -not -path '*/\.*' -maxdepth 1 -mindepth 1 -type d | sed -e 's/^\.\///'| xargs -I % sh -c 'stow %'
# Remove stow link anytime with stow -D <directory>
```

### Git

See [git/README.md](git/README.md) for SSH/GPG key setup and `.gitconfig.local` details.
