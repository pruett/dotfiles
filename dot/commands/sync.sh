# dot sync: keep this Mac and exe.dev boxes in step through GitHub.


# The dotfiles repo on GitHub is the meeting point: every machine pulls from it
# and pushes its own commits to it. Uncommitted changes are never committed or
# pushed; the pull keeps them (--autostash). Boxes run `dot sync` every 10
# minutes from a systemd timer that the private iac repo's
# infra/exe-dev/first-boot.sh installs, so a push from the Mac reaches them.
sync_repo() {
  git -C "$repo_root" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 \
    || fail "$(git -C "$repo_root" branch --show-current) has no upstream branch; nothing to sync with."

  info "Pulling $(hostname -s)..."
  if ! git -C "$repo_root" pull --quiet --rebase --autostash; then
    fail "Pull stopped on a conflict in $repo_root. Resolve it there ('git status'), then run 'dot sync' again."
  fi

  if [[ -n "$(git -C "$repo_root" log --oneline '@{u}..' 2>/dev/null)" ]]; then
    info "Pushing $(git -C "$repo_root" log --oneline '@{u}..' | wc -l | tr -d ' ') local commit(s)..."
    git -C "$repo_root" push --quiet || warn "Push failed; the commits stay here. Is 'gh auth status' logged in?"
  fi

  if [[ -n "$(git -C "$repo_root" status --porcelain -- home/.agents)" ]]; then
    warn "Uncommitted skill changes in $repo_root/home/.agents; commit them to share them."
  fi
}

sync_boxes() {
  command -v hc >/dev/null || fail "--boxes needs hc (herdr-core) on this Mac."
  local box found=false
  for box in $(hc machine ls --json | grep -o '"target":"[^"]*\.exe\.xyz"' | cut -d'"' -f4); do
    found=true
    info "Syncing ${box}..."
    # shellcheck disable=SC2088 # ~ expands on the box
    ssh -o ConnectTimeout=15 "$box" '~/.local/bin/dot sync' || warn "${box} did not sync."
  done
  $found || warn "No exe.dev boxes in 'hc machine ls'."
}

cmd_sync() {
  case "${1:-}" in
    ""|--boxes) ;;
    *) fail "Usage: dot sync [--boxes]" ;;
  esac
  sync_repo
  # Re-exec so a pull that changed this script links with the new version.
  "$script_path" link
  info "$(find "$target/.claude/skills" -maxdepth 1 -type l | wc -l | tr -d ' ') skills linked for Claude Code"
  [[ "${1:-}" == --boxes ]] && sync_boxes
  return 0
}

