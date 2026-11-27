# dot package: install or uninstall a Homebrew package and keep the package
# list in step, so the two never drift apart. The list is this OS's
# (`brewfile`); --linux picks packages/bundle.linux from the Mac, which only
# edits the file: VMs install it on their next `dot update`.

package_usage() {
  cat <<'EOF'
Usage: dot package <command>

  add <name> [cask]     Install, then add to packages/bundle with Homebrew's
                        description as its comment. A tapped name
                        (owner/tap/name) also adds its tap and trusted: true
  remove <name>         Remove from packages/bundle (and its tap, if nothing else
                        uses it), then ask before uninstalling. --uninstall
                        skips the question, --keep keeps it installed
  list                  Every packages/bundle entry, and whether it is installed
  check                 What packages/bundle lists but isn't installed

  --linux (any command)  Use packages/bundle.linux, the exe.dev VMs' list. From
                         the Mac, add and remove only edit it; nothing is
                         installed or uninstalled here
EOF
}

# package_local: false when the list isn't this machine's (--linux on the Mac).
package_local=true

cmd_package() {
  command -v brew >/dev/null || fail "Homebrew is not installed; run: dot init --only homebrew"
  local arg args=()
  for arg in "$@"; do
    if [[ "$arg" == --linux ]]; then
      brewfile="$linux_brewfile"
      [[ "$dot_os" == linux ]] || package_local=false
    else
      args+=("$arg")
    fi
  done
  set -- ${args[@]+"${args[@]}"}
  local sub="${1:-list}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    add) package_add "$@" ;;
    remove|rm) package_remove "$@" ;;
    list|ls) package_list ;;
    check)
      [[ "$package_local" == true ]] || fail "Run 'dot package check' on a VM to check packages/bundle.linux."
      brew bundle check --verbose --file="$brewfile"
      ;;
    -h|--help|help) package_usage ;;
    *) warn "Unknown package command: $sub"; package_usage >&2; exit 2 ;;
  esac
}

package_add() {
  [[ $# -ge 1 && $# -le 2 ]] || { package_usage >&2; exit 2; }
  local name="$1" kind="${2:-brew}" tap description options="" block=""
  [[ "$kind" == brew || "$kind" == cask ]] || fail "Kind must be brew or cask, not: $kind"
  [[ "$kind" == cask && "$brewfile" == "$linux_brewfile" ]] && fail "Casks are macOS apps; packages/bundle.linux takes formulae only."
  tap="$(tap_of "$name")"

  if [[ "$package_local" == false ]]; then
    brew info --formula "$name" >/dev/null 2>&1 || fail "Homebrew has no formula named $name."
  elif brew_installed "$kind" "$name"; then
    info "$name is already installed"
  else
    brew install --yes "--$( [[ "$kind" == cask ]] && echo cask || echo formula )" "$name" \
      || fail "brew install failed; ${brewfile#"$repo_root"/} is unchanged."
  fi

  if [[ -n "$(brewfile_find "$name")" ]]; then
    info "Already in ${brewfile#"$repo_root"/} as: $(brewfile_find "$name")"
    return 0
  fi
  if [[ -n "$tap" ]] && ! brewfile_has tap "$tap"; then
    brewfile_insert tap "$tap" "tap \"$tap\""$'\n'
    info "Added tap \"$tap\" to ${brewfile#"$repo_root"/}"
  fi
  # Homebrew asks before using packages from third-party taps; existing tapped
  # entries mark theirs trusted, so `brew bundle` doesn't stop to ask.
  [[ -n "$tap" ]] && options=", trusted: true"
  description="$(brew_description "$kind" "$name")"
  [[ -n "$description" ]] && block="# $description"$'\n'
  block+="$kind \"$name\"$options"$'\n'
  brewfile_insert "$kind" "$name" "$block"
  info "Added $kind \"$name\" to ${brewfile#"$repo_root"/}"
}

package_remove() {
  local name="" uninstall=ask found kind full tap
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --uninstall) uninstall=yes ;;
      --keep) uninstall=no ;;
      -*) fail "Unknown option: $1" ;;
      *) [[ -z "$name" ]] || { package_usage >&2; exit 2; }; name="$1" ;;
    esac
    shift
  done
  [[ -n "$name" ]] || { package_usage >&2; exit 2; }

  found="$(brewfile_find "$name")"
  [[ -n "$found" ]] || fail "$name is not in ${brewfile#"$repo_root"/} (see: dot package list)"
  kind="${found%% *}"
  full="${found#* }"
  brewfile_remove "$kind" "$full"
  info "Removed $kind \"$full\" from ${brewfile#"$repo_root"/}"

  tap="$(tap_of "$full")"
  if [[ -n "$tap" ]] && ! grep -q "\"$tap/" "$brewfile"; then
    brewfile_remove tap "$tap"
    info "Removed tap \"$tap\" (nothing else in ${brewfile#"$repo_root"/} uses it)"
  fi

  [[ "$kind" == npm ]] && { info "npm packages aren't uninstalled here; run: npm uninstall -g $full"; return 0; }
  [[ "$package_local" == true ]] || return 0
  brew_installed "$kind" "$full" || return 0
  if [[ "$uninstall" == ask ]]; then
    confirm "Uninstall $full too?" && uninstall=yes || uninstall=no
  fi
  if [[ "$uninstall" == yes ]]; then
    brew uninstall "--$( [[ "$kind" == cask ]] && echo cask || echo formula )" "$full"
  else
    info "$full stays installed"
  fi
}

package_list() {
  local kind name rest mark installed
  # One `brew list` per kind instead of one per package.
  installed="$(brew list --formula -1 | sed 's/^/brew /'; brew list --cask -1 | sed 's/^/cask /')"
  while read -r kind name rest; do
    name="${name#\"}"
    name="${name%%\"*}"
    case "$kind" in
      brew|cask)
        if grep -qx "$kind ${name##*/}" <<<"$installed"; then
          mark="${c_green}✓${c_reset}"
        else
          mark="${c_red}✗${c_reset}"
        fi
        ;;
      *) mark=" " ;;
    esac
    # --linux on the Mac: what's installed here says nothing about the VMs.
    [[ "$package_local" == true ]] || mark=" "
    printf '  %s %-5s %s\n' "$mark" "$kind" "$name"
  done < <(grep -E '^(tap|brew|cask|npm) ' "$brewfile")
}
