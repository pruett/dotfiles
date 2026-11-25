# Everything packages/bundle (the Brewfile) lists. Edit it with `dot package`.
# gh and stow are checked separately because the components after this one
# need them.
define_component packages darwin required "Homebrew packages (packages/bundle)"

packages_need_tools() {
  local tool rc=0
  for tool in gh stow; do
    check_item --hint "dot package add $tool" "$tool is installed" command -v "$tool" || rc=1
  done
  return "$rc"
}

component_packages_install() {
  if ! brew bundle install --no-upgrade --file="$brewfile"; then
    mark_warn "Some packages/bundle entries failed (see above). 'dot package check' lists them; 'dot init --only packages' retries"
  fi
  packages_need_tools
}

# brew bundle upgrades what packages/bundle lists, and leaves everything else alone.
component_packages_update() {
  if ! brew bundle install --file="$brewfile"; then
    mark_warn "Some packages/bundle entries failed to install or upgrade (see above)"
  fi
  packages_need_tools
}

component_packages_check() {
  local rc=0
  packages_need_tools || rc=1
  check_item --warn --hint "dot package check" "Everything in packages/bundle is installed" \
    brew bundle check --file="$brewfile"
  return "$rc"
}
