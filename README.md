# [~/.\*](https://dotfiles.github.io/)

## New machine setup

1. homebrew
2. git
3. ssh
4. clone and install dotfiles

## Installation

```bash
$ curl https://raw.githubusercontent.com/pruett/dotfiles/master/install | sh
```

## Install Homebrew (and formulae)

Visit https://brew.sh/ and install Homebrew

Next, install homebrew formulae defined in Brewfile

```bash
$ brew bundle
```

## Setup dotfile symlinks with `stow`

Use [GNU Stow](https://www.gnu.org/software/stow/) to manage our symlinks:

```bash
$ brew install stow
# Loop over directories and run `stow` to enable respective dotfile symlinking
$ cd ~/.dotfiles && find . -not -path '*/\.*' -maxdepth 1 -mindepth 1 -type d | sed -e 's/^\.\///'| xargs -I % sh -c 'stow %'
# Remove stow link anytime with stow -D <directory>
```

Finally, [set up git](git/README.md)
