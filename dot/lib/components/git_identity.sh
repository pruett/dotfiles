# This machine's git name and email, in home/.gitconfig.local (gitignored),
# which home/.gitconfig includes. Runs before links so the file gets linked.
# On exe.dev VMs first boot writes the file (identity and SSH signing) before
# `dot init --headless`, so this only checks it there.
define_component git_identity all optional "Git identity (.gitconfig.local)"

local_gitconfig="$managed_home/.gitconfig.local"

git_identity_set() {
  git config -f "$local_gitconfig" user.name >/dev/null && git config -f "$local_gitconfig" user.email >/dev/null
}

component_git_identity_install() {
  if git_identity_set; then
    mark_ok "Set to $(git config -f "$local_gitconfig" user.name)"
    return 0
  fi
  local name="" email=""
  if ! ask "  git user.name: " name || ! ask "  git user.email: " email; then
    mark_fail "Needs a terminal to ask for your name and email; run: dot init --only git_identity"
    return 1
  fi
  [[ -f "$local_gitconfig" ]] || cp "$managed_home/.gitconfig.local.sample" "$local_gitconfig"
  git config -f "$local_gitconfig" user.name "$name"
  git config -f "$local_gitconfig" user.email "$email"
  mark_ok "Wrote home/.gitconfig.local (add signing keys there if you sign commits)"
}

component_git_identity_check() {
  check_item --hint "dot init --only git_identity" "user.name and user.email are set in home/.gitconfig.local" git_identity_set
}
