# Xcode Command Line Tools: git, clang and the headers Homebrew builds with.
# bootstrap installs them too, since it needs git to clone this repo.
define_component xcode darwin required "Xcode Command Line Tools"

component_xcode_install() {
  if xcode-select -p >/dev/null 2>&1; then
    mark_ok "Already installed"
    return 0
  fi
  info "Installing (a dialog will appear)..."
  xcode-select --install >/dev/null 2>&1 || true
  local waited=0
  until xcode-select -p >/dev/null 2>&1; do
    sleep 5
    waited=$((waited + 5))
    if [[ $waited -ge 1800 ]]; then
      mark_fail "Timed out. Install them with 'xcode-select --install', then run: dot init"
      return 1
    fi
  done
  mark_ok "Installed"
}

component_xcode_check() {
  check_item --hint "dot init --only xcode" "Command Line Tools are installed" xcode-select -p
}
