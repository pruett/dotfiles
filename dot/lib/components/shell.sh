# Linux (exe.dev VMs): make Homebrew's zsh the login shell, so `ssh exe-dev-*`
# lands in the same zsh setup as the Mac (home/.zshrc, ~/.config/zsh). macOS
# already defaults to zsh. Uses sudo, which exe.dev's exedev user has without
# a password.
define_component shell linux optional "Login shell (zsh)"

shell_zsh_path() {
  command -v zsh
}

shell_is_zsh() {
  local zsh
  zsh="$(shell_zsh_path)" || return 1
  [[ "$(getent passwd "$(id -un)" | cut -d: -f7)" == "$zsh" ]]
}

component_shell_install() {
  local zsh
  if shell_is_zsh; then
    mark_ok "Login shell is $(shell_zsh_path)"
    return 0
  fi
  zsh="$(shell_zsh_path)" || { mark_fail "zsh is missing (brew \"zsh\" in packages/bundle)"; return 1; }
  grep -qxF "$zsh" /etc/shells || echo "$zsh" | sudo tee -a /etc/shells >/dev/null \
    || { mark_fail "Could not add $zsh to /etc/shells"; return 1; }
  sudo chsh -s "$zsh" "$(id -un)" || { mark_fail "chsh to $zsh failed"; return 1; }
  mark_ok "Login shell is now $zsh (next login)"
}

component_shell_check() {
  check_item --warn --hint "dot init --only shell" "Login shell is zsh" shell_is_zsh
}
