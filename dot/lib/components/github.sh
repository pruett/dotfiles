# GitHub: gh logged in (which also makes and uploads an SSH key), github.com in
# known_hosts, and origin switched from the HTTPS clone to SSH so this machine
# can push.
define_component github darwin required "GitHub login and SSH remote"

# ssh -T to GitHub exits 1 even when the key works ("does not provide shell
# access"), so match the greeting instead of trusting the exit status.
github_ssh_works() {
  local greeting
  greeting="$(ssh -T -o BatchMode=yes -o ConnectTimeout=10 git@github.com 2>&1 || true)"
  [[ "$greeting" == *"successfully authenticated"* ]]
}

origin_uses_ssh() {
  [[ "$(git -C "$repo_root" remote get-url origin)" == git@github.com:* ]]
}

# https://github.com/owner/repo(.git) -> git@github.com:owner/repo.git
origin_ssh_url() {
  local path
  path="$(git -C "$repo_root" remote get-url origin)"
  path="${path#https://github.com/}"
  printf 'git@github.com:%s.git\n' "${path%.git}"
}

component_github_install() {
  if gh auth status >/dev/null 2>&1; then
    mark_ok "gh is logged in"
  elif ! has_tty; then
    mark_fail "gh is not logged in; run 'dot init --only github' in a terminal"
    return 1
  else
    info "Logging in to GitHub (this also makes and uploads an SSH key)..."
    gh auth login --hostname github.com --git-protocol ssh --web </dev/tty \
      || { mark_fail "GitHub login failed or was cancelled"; return 1; }
    mark_ok "gh is logged in"
  fi

  if ! ssh-keygen -F github.com >/dev/null 2>&1; then
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keyscan -t ed25519 github.com >>"$HOME/.ssh/known_hosts" 2>/dev/null
  fi
  if ! github_ssh_works; then
    mark_fail "SSH to GitHub failed. Run 'gh auth login --git-protocol ssh --web' and check https://github.com/settings/keys"
    return 1
  fi
  mark_ok "SSH to GitHub works"

  if ! origin_uses_ssh; then
    git -C "$repo_root" remote set-url origin "$(origin_ssh_url)"
  fi
  mark_ok "origin is $(git -C "$repo_root" remote get-url origin)"
}

component_github_check() {
  local rc=0
  check_item --hint "dot init --only github" "gh is logged in" gh auth status || rc=1
  check_item --hint "dot init --only github" "SSH to GitHub works" github_ssh_works || rc=1
  check_item --warn --hint "dot init --only github" "origin uses SSH" origin_uses_ssh
  return "$rc"
}
