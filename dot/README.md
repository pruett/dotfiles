# dot

`dot` sets up, updates and checks this machine from the repo. It is Bash split
into small files, and runs on the stock macOS `/bin/bash` (3.2).
`home/.local/bin/dot` is a symlink to `dot/bin/dot`, so stow puts it on PATH.

```bash
dot init                   # install everything (new machine); safe to rerun
dot update                 # pull the repo, then update everything
dot doctor                 # check everything; exits 1 if a required component fails
dot components             # what dot manages, in run order
dot update --only packages # init, update and doctor take --only a,b and --skip a,b
dot init --dry-run         # print the plan, change nothing (init and update)
dot package add jq         # install and add to packages/bundle
```

## Components

Everything `dot` installs is a **component**: one file in
`lib/components/<name>.sh`.

| Step | Run by | Rule |
|------|--------|------|
| `component_<name>_install` | `dot init` | required; safe to run again (skips what is already done) |
| `component_<name>_update`  | `dot update` | optional; without it, update runs install |
| `component_<name>_check`   | `dot doctor` | required; prints ✓/⚠/✗ lines, returns 1 only for a real problem |

`init`, `update` and `doctor` walk the same list, `component_order` in
`lib/components.sh`, so a tool can't be installed by `init` and then forgotten
by `update` or `doctor`:

```text
dot init    → for each component: install  (stops at a failed required one)
dot update  → git pull (restarts if dot/ changed) → for each component: update
dot doctor  → for each component: check    (exit 1 if a required one fails)
              └─ then a summary: ✓ ok · ⚠ warnings · ✗ failed
```

| Component | Platform | What it does |
|-----------|----------|--------------|
| `xcode` | macOS | Command Line Tools |
| `homebrew` | macOS | Homebrew; update runs `brew update` |
| `packages` | macOS | `brew bundle` on packages/bundle; update upgrades what it lists |
| `github` | macOS | `gh auth login`, SSH to GitHub, origin switched to SSH |
| `git_identity` | macOS | name and email in `home/.gitconfig.local` (optional) |
| `links` | all | `dot link`: stow and Claude Code skill links |
| `ssh` | macOS | adds `Include ~/.ssh/config.d/*` to the top of `~/.ssh/config` (optional) |
| `macos` | macOS | Dock, trackpad and Wi-Fi DNS settings; Caps Lock as Control via a `hidutil` launch agent (optional) |
| `skills` | macOS | update runs `dot skills update`; changed skill files are yours to review and commit (optional) |
| `rex` | macOS | the Rex terminal from its own update feed (signature checked), config check, terminfo, agent skill and hooks (optional) |

On Linux (exe.dev boxes) only `links` runs, and it links just the agent skills
and their CLIs.

### Add a component

1. Create `lib/components/<name>.sh`:

   ```bash
   # Zoxide: what it is and anything surprising about how it is installed.
   define_component zoxide darwin optional "zoxide"

   component_zoxide_install() {
     if command -v zoxide >/dev/null; then
       mark_ok "Already installed"
       return 0
     fi
     brew install zoxide
   }

   component_zoxide_check() {
     check_item --warn --hint "dot init --only zoxide" "zoxide is installed" command -v zoxide
   }
   ```

2. Add `<name>` to `component_order` in `lib/components.sh`.
3. `shellcheck bin/dot lib/*.sh lib/components/*.sh commands/*.sh` (from `dot/`).

Functions run inside `if`, where `set -e` is off, so return 1 explicitly on
failure (`cmd || return 1`). A required component that fails stops `init` and
`update`; an optional one only warns.

## Packages

`dot package` keeps packages/bundle and what's installed in step:

```bash
dot package add jq                     # brew install, then add with Homebrew's description as the comment
dot package add anomalyco/tap/hex cask # a tapped cask: also adds the tap, and trusted: true
dot package remove jq                  # remove from packages/bundle, then ask before uninstalling
dot package list                       # every entry, ✓ installed / ✗ missing
dot package check                      # brew bundle check --verbose
```

New entries go before the first entry of their kind whose name sorts after
theirs (ignoring the tap prefix).

## Layout

```text
dot/
├── bin/dot                 # entry point: sets paths, sources lib/ and commands/, dispatches
├── lib/
│   ├── output.sh           # info/warn/fail, heading, mark_ok/warn/fail, check_item, ask, confirm
│   ├── components.sh       # define_component, component_order, --only/--skip, run_phase
│   ├── links.sh            # stow, folded directories, skill links (dot link, dot status)
│   ├── brewfile.sh         # read and edit packages/bundle
│   └── components/<name>.sh
└── commands/<command>.sh   # cmd_<command>, one file per command
```
