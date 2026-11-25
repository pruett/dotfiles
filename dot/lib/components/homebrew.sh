# Homebrew itself. The packages component installs what packages/bundle lists.
define_component homebrew darwin required "Homebrew"

# Put brew on PATH (Apple Silicon or Intel prefix). Returns 1 if it isn't installed.
brew_shellenv() {
  local prefix
  for prefix in /opt/homebrew /usr/local; do
    if [[ -x "$prefix/bin/brew" ]]; then
      eval "$("$prefix/bin/brew" shellenv)"
      return 0
    fi
  done
  return 1
}

component_homebrew_install() {
  if brew_shellenv; then
    mark_ok "Already installed ($(brew --prefix))"
    return 0
  fi
  if ! has_tty; then
    mark_fail "The Homebrew installer asks for your password; run 'dot init --only homebrew' in a terminal"
    return 1
  fi
  local installer
  installer="$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || { mark_fail "Could not download the Homebrew installer"; return 1; }
  info "Installing Homebrew (it may ask for your macOS password)..."
  if ! /bin/bash -c "$installer" </dev/tty || ! brew_shellenv; then
    mark_fail "Homebrew install failed. Install it per https://brew.sh (needs an admin account), then run: dot init"
    return 1
  fi
  mark_ok "Installed"
}

component_homebrew_update() {
  brew_shellenv || { mark_fail "Homebrew is not installed (run: dot init --only homebrew)"; return 1; }
  brew update --quiet || return 1
  mark_ok "Homebrew updated"
}

component_homebrew_check() {
  check_item --hint "dot init --only homebrew" "brew is installed" brew_shellenv
}
