# Set up git

## Create and add SSH/GPG keys to GitHub

https://github.com/settings/keys

## Add sensitive git credentials to .gitconfig.local

```bash
$ cp git/.gitconfig.local.sample git/.gitconfig.local
```

## Add repo

```bash
$ git init
$ git remote origin git@github.com:pruett/dotfiles.git
```
