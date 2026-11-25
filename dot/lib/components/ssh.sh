# ~/.ssh/config stays a local file (apps such as Rex and colima add their own
# Include lines to it), so the tracked ssh settings live in home/.ssh/config.d/
# and this component makes sure ~/.ssh/config includes them. The Include has
# to come first: ssh applies it only to the hosts that follow it.
define_component ssh darwin optional "SSH config (config.d)"

ssh_config="$HOME/.ssh/config"
ssh_include_line="Include ~/.ssh/config.d/*"

ssh_include_present() {
  grep -qxF "$ssh_include_line" "$ssh_config" 2>/dev/null
}

component_ssh_install() {
  if ssh_include_present; then
    mark_ok ".ssh/config includes config.d/"
    return 0
  fi
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  local tmp
  tmp="$(mktemp)"
  { printf '%s\n' "$ssh_include_line"; cat "$ssh_config" 2>/dev/null || true; } >"$tmp" \
    && cat "$tmp" >"$ssh_config" && chmod 600 "$ssh_config"
  rm -f "$tmp"
  ssh_include_present || { mark_fail "Could not add the Include to ~/.ssh/config"; return 1; }
  mark_ok "Added '$ssh_include_line' to the top of ~/.ssh/config"
}

component_ssh_check() {
  check_item --warn --hint "dot init --only ssh" ".ssh/config includes config.d/" ssh_include_present
}
