# pi, the coding agent: a global npm package on Homebrew's Node (the node in
# packages/bundle), so it runs after the packages component. Update uses
# `pi update --all`, which updates pi and every package in
# home/.pi/agent/settings.json; `brew bundle` doesn't reliably upgrade it.
define_component pi darwin optional "pi coding agent"

pi_package="@earendil-works/pi-coding-agent"

component_pi_install() {
  if command -v pi >/dev/null; then
    mark_ok "pi is installed ($(pi --version 2>/dev/null))"
    return 0
  fi
  command -v npm >/dev/null || { mark_fail "npm is missing (brew \"node\" in packages/bundle)"; return 1; }
  npm install -g "$pi_package" || { mark_fail "npm install -g $pi_package failed"; return 1; }
  mark_ok "Installed pi $(pi --version 2>/dev/null)"
}

component_pi_update() {
  command -v pi >/dev/null || { component_pi_install; return; }
  local before
  before="$(pi --version 2>/dev/null)"
  # --no-approve: ignore project-local pi files in whatever directory this runs from.
  pi update --all --no-approve || { mark_fail "pi update --all failed"; return 1; }
  mark_ok "pi $before -> $(pi --version 2>/dev/null), packages updated"
}

component_pi_check() {
  check_item --warn --hint "dot init --only pi" "pi is installed" command -v pi
}
