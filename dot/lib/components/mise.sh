# mise owns Node and the global npm CLIs (pi, vercel, agent-browser, ...) in
# home/.config/mise/config.toml. It runs after links, so that config is in
# place. mise waits 24h before installing a new release (minimum_release_age),
# so `dot update` can lag a fresh release by a day.
define_component mise darwin optional "mise tools (Node, npm CLIs)"

mise_nothing_missing() {
  [[ -z "$(mise ls --missing 2>/dev/null)" ]]
}

component_mise_install() {
  command -v mise >/dev/null || { mark_fail "mise is missing (brew \"mise\" in packages/bundle)"; return 1; }
  mise install --yes || { mark_fail "mise install failed"; return 1; }
  mark_ok "mise tools are installed"
}

component_mise_update() {
  command -v mise >/dev/null || { mark_fail "mise is missing (brew \"mise\" in packages/bundle)"; return 1; }
  mise upgrade --yes || { mark_fail "mise upgrade failed"; return 1; }
  mark_ok "mise tools are up to date"
  # pi's own packages (home/.pi/agent/settings.json); mise upgrades pi itself.
  # --no-approve: ignore project-local pi files in whatever directory this runs from.
  if mise which pi >/dev/null 2>&1; then
    mise exec -- pi update --extensions --no-approve || { mark_warn "pi update --extensions failed"; return 0; }
    mark_ok "pi packages are up to date"
  fi
}

component_mise_check() {
  local rc=0
  check_item --hint "dot package add mise" "mise is installed" command -v mise || rc=1
  check_item --warn --hint "dot init --only mise" "Every tool in the mise config is installed" mise_nothing_missing
  return "$rc"
}
