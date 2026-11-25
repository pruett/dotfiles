# dot update: pull the repo, then update every component.

cmd_update() {
  local pull=true arg args=()
  for arg in "$@"; do
    if [[ "$arg" == --no-pull ]]; then pull=false; else args+=("$arg"); fi
  done
  parse_component_options update ${args[@]+"${args[@]}"}
  if [[ "$dry_run" == true ]]; then
    [[ "$pull" == true ]] && info "would run git pull --rebase --autostash in $repo_root"
  elif [[ "$pull" == true ]]; then
    pull_repo ${args[@]+"${args[@]}"}
  fi
  run_phase update
}

# Pull with rebase, keeping uncommitted changes (--autostash). This doesn't
# push; `dot sync` does. When the pull changed dot/ itself, restart with the
# new version so the rest of the update runs the code just pulled.
pull_repo() {
  local before after
  heading "Repo ($repo_root)"
  if ! git -C "$repo_root" rev-parse --verify --quiet '@{u}' >/dev/null; then
    mark_warn "$(git -C "$repo_root" branch --show-current) has no upstream branch; not pulling"
    return 0
  fi
  before="$(git -C "$repo_root" rev-parse HEAD)"
  # DOT_SYNC tells .githooks/relink to skip; the links component relinks.
  DOT_SYNC=1 git -C "$repo_root" pull --quiet --rebase --autostash \
    || fail "Pull stopped on a conflict in $repo_root. Resolve it there ('git status'), then run 'dot update' again."
  after="$(git -C "$repo_root" rev-parse HEAD)"
  if [[ "$before" == "$after" ]]; then
    mark_ok "Already up to date"
    return 0
  fi
  mark_ok "Pulled $(git -C "$repo_root" rev-list --count "$before..$after") commit(s)"
  if ! git -C "$repo_root" diff --quiet "$before" "$after" -- dot; then
    info "dot itself changed; restarting with the new version"
    exec "$repo_root/dot/bin/dot" update --no-pull "$@"
  fi
}
