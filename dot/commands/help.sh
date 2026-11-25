# dot help.

usage() {
  cat <<'USAGE'
Usage: dot <command>

Set up, update and check this machine:
  init [options]       Install every component (new machine); safe to rerun
  update [options]     Pull this repo, then update every component
  doctor [options]     Check every component; exits 1 if a required one fails
  components           List components in run order, with platform and update step

  Options: --only a,b and --skip a,b (names from 'dot components');
  init and update also take --dry-run.

Packages (packages/bundle, the Brewfile):
  package add <name> [cask]   Install and add to packages/bundle
  package remove <name>       Remove from packages/bundle, then ask to uninstall
  package list                packages/bundle entries, with what's installed
  package check               What packages/bundle lists but isn't installed

Links and sync:
  link                 Stow every package into ~, link folded directories and
                       agent skills (~/.claude/skills), remove stale links
  status               Show what 'link' would change (exits 1 if anything is out of date)
  sync [--boxes]       Pull, push this machine's commits, then link; --boxes then
                       runs 'dot sync' on every exe.dev box (hc machine ls)

Skills:
  skills [list]        List agent skills with short descriptions
  skills add <source>  Add skills from a path, URL, or GitHub repository
  skills update [...]  Update all lockfile-managed skills, or only the named ones

  edit                 Open the dotfiles repo in $EDITOR
  help                 Show this help

On Linux (exe.dev boxes) only the links component runs, and it links just the
agent skills and their CLIs. In zsh, bare `dot` (a function in aliases.zsh)
cds into the repo and opens it.
USAGE
}
