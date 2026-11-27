# Homebrew itself, on macOS and on Linux (exe.dev VMs), so both run the same
# packages/bundle and the zsh config finds its plugins with `brew --prefix`.
# The packages component installs what packages/bundle lists.
define_component homebrew all required "Homebrew"

# Put brew on PATH (Apple Silicon, Intel, or Linux prefix). Returns 1 if it isn't installed.
brew_shellenv() {
  local prefix
  for prefix in /opt/homebrew /usr/local /home/linuxbrew/.linuxbrew; do
    if [[ -x "$prefix/bin/brew" ]]; then
      eval "$("$prefix/bin/brew" shellenv)"
      return 0
    fi
  done
  return 1
}

# On Linux the installer needs sudo to create /home/linuxbrew. With
# passwordless sudo (exe.dev's exedev user) it runs without a terminal.
homebrew_can_install_unattended() {
  [[ "$dot_os" == linux ]] && sudo -n true 2>/dev/null
}

component_homebrew_install() {
  if brew_shellenv; then
    mark_ok "Already installed ($(brew --prefix))"
    return 0
  fi
  local installer unattended=false
  homebrew_can_install_unattended && unattended=true
  if [[ "$unattended" == false ]] && ! has_tty; then
    mark_fail "The Homebrew installer asks for your password; run 'dot init --only homebrew' in a terminal"
    return 1
  fi
  installer="$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || { mark_fail "Could not download the Homebrew installer"; return 1; }
  if [[ "$unattended" == true ]]; then
    info "Installing Homebrew (unattended, with sudo)..."
    NONINTERACTIVE=1 /bin/bash -c "$installer" </dev/null || { mark_fail "Homebrew install failed (see above)"; return 1; }
  else
    info "Installing Homebrew (it may ask for your password)..."
    /bin/bash -c "$installer" </dev/tty || { mark_fail "Homebrew install failed. Install it per https://brew.sh (needs an admin account), then run: dot init"; return 1; }
  fi
  brew_shellenv || { mark_fail "Homebrew installed, but brew isn't where dot looks (see brew_shellenv)"; return 1; }
  mark_ok "Installed ($(brew --prefix))"
}

component_homebrew_update() {
  brew_shellenv || { mark_fail "Homebrew is not installed (run: dot init --only homebrew)"; return 1; }
  brew update --quiet || return 1
  mark_ok "Homebrew updated"
}

component_homebrew_check() {
  check_item --hint "dot init --only homebrew" "brew is installed" brew_shellenv
}
