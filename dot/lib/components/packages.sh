# Everything packages/bundle (the Brewfile) lists. Edit it with `dot package`.
# gh and stow are checked separately because the components after this one
# need them. On Linux, casks and the macOS-only formulae in
# packages_macos_only are left out (packages_brewfile).
define_component packages all required "Homebrew packages (packages/bundle)"

# Formulae that only build on macOS.
packages_macos_only=(pinentry-mac)

# Homebrew's ask mode stops for [y/N] before downloading. brew upgrade takes
# --yes; brew bundle has no flag, so it gets HOMEBREW_NO_ASK.

# The Brewfile for this OS: packages/bundle itself on macOS; on Linux a copy
# without casks or packages_macos_only, written next to the lock file
# (gitignored) so brew bundle can read it.
packages_brewfile() {
  local file name pattern=""
  if [[ "$dot_os" == darwin ]]; then
    printf '%s\n' "$brewfile"
    return 0
  fi
  for name in "${packages_macos_only[@]}"; do
    pattern+="|${name}"
  done
  file="$repo_root/packages/bundle.linux"
  grep -vE "^[[:space:]]*(cask[[:space:]]|brew[[:space:]]+\"(${pattern#|})\")" "$brewfile" >"$file"
  printf '%s\n' "$file"
}

packages_need_tools() {
  local tool rc=0
  for tool in gh stow; do
    check_item --hint "dot package add $tool" "$tool is installed" command -v "$tool" || rc=1
  done
  return "$rc"
}

component_packages_install() {
  if ! HOMEBREW_NO_ASK=1 brew bundle install --no-upgrade --file="$(packages_brewfile)"; then
    mark_warn "Some packages/bundle entries failed (see above). 'dot package check' lists them; 'dot init --only packages' retries"
  fi
  packages_need_tools
}

# Install anything packages/bundle lists that is missing, upgrade every
# installed formula and cask (listed or not), then delete old versions.
component_packages_update() {
  if ! HOMEBREW_NO_ASK=1 brew bundle install --no-upgrade --file="$(packages_brewfile)"; then
    mark_warn "Some packages/bundle entries failed to install (see above)"
  fi
  brew upgrade --yes || mark_warn "brew upgrade failed for some packages (see above)"
  brew cleanup || mark_warn "brew cleanup failed (see above)"
  packages_need_tools
}

component_packages_check() {
  local rc=0
  packages_need_tools || rc=1
  check_item --warn --hint "dot package check" "Everything in packages/bundle is installed" \
    brew bundle check --file="$(packages_brewfile)"
  return "$rc"
}
