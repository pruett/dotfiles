# Rex, the terminal app. It isn't in Homebrew: dot installs and updates it from
# Rex's own update feed (a Sparkle appcast), and only after checking the
# download is signed by Rex's developer team. Then it checks the stowed config
# (home/.config/rex), and sets up Rex's terminfo entry (xterm-rex, plus an
# Include in ~/.ssh/config) and its agent skill and hooks.
define_component rex darwin optional "Rex terminal"

rex_app="/Applications/Rex.app"
rex_team_id="AG92C3PT77"
rex_bundled_cli="$HOME/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex"

# The feed the installed app already follows, so dot keeps its channel;
# the preview channel for a first install.
rex_appcast_url() {
  local url
  url="$(defaults read "$rex_app/Contents/Info" SUFeedURL 2>/dev/null || true)"
  if [[ -z "$url" ]]; then
    if [[ "$(uname -m)" == arm64 ]]; then
      url="https://blob.superlogical.com/public/rex-app/preview-arm64/appcast.xml"
    else
      url="https://blob.superlogical.com/public/rex-app/preview/appcast.xml"
    fi
  fi
  printf '%s\n' "$url"
}

# Print the rex CLI: $REX_BIN_DIR inside Rex terminals, then the copy bundled
# with the app's server, then PATH. Ubuntu-style unrelated `rex` binaries
# don't print "rex 0.x", so they don't count.
rex_cli() {
  if [[ -n "${REX_BIN_DIR:-}" && -x "$REX_BIN_DIR/rex" ]]; then
    printf '%s\n' "$REX_BIN_DIR/rex"
  elif [[ -x "$rex_bundled_cli" ]]; then
    printf '%s\n' "$rex_bundled_cli"
  elif command -v rex >/dev/null && rex version 2>/dev/null | grep -q '^rex 0\.'; then
    command -v rex
  else
    return 1
  fi
}

rex_running() { pgrep -qf "$rex_app/Contents/MacOS/"; }

rex_installed_build() {
  defaults read "$rex_app/Contents/Info" CFBundleVersion 2>/dev/null
}

# Print "<build> <dmg-url>" for the newest build in the appcast.
rex_latest_release() {
  local appcast
  appcast="$(curl -fsSL --retry 3 "$(rex_appcast_url)")" || return 1
  awk '
    /<sparkle:version>/ { gsub(/.*<sparkle:version>|<\/sparkle:version>.*/, ""); build = $0 }
    /<enclosure / && build != "" {
      match($0, /url="[^"]+"/)
      url = substr($0, RSTART + 5, RLENGTH - 6)
      if (best == "" || build + 0 > best + 0) { best = build; best_url = url }
      build = ""
    }
    END { if (best != "") print best, best_url }
  ' <<<"$appcast"
}

# Install the app from a disk image, after checking its signature and team.
# Never used on a running app; that one updates itself through Sparkle.
rex_install_dmg() {
  local url="$1" work mount app status=1
  work="$(mktemp -d)" || return 1
  mount="$work/mount"
  info "Downloading ${url##*/}..."
  if ! curl -fsSL --retry 3 -o "$work/rex.dmg" "$url" \
    || ! hdiutil attach -nobrowse -readonly -quiet -mountpoint "$mount" "$work/rex.dmg"; then
    rm -rf "$work"
    return 1
  fi
  app="$(find "$mount" -maxdepth 1 -name '*.app' -print -quit)"
  if [[ -z "$app" ]]; then
    mark_fail "No app in the Rex disk image"
  elif ! codesign --verify --deep --strict "$app" 2>/dev/null \
    || ! codesign -dv "$app" 2>&1 | grep -q "^TeamIdentifier=$rex_team_id$"; then
    mark_fail "The Rex disk image failed signature verification; not installing it"
  elif ditto "$app" "$rex_app.new" && rm -rf "$rex_app" && mv "$rex_app.new" "$rex_app"; then
    status=0
  fi
  hdiutil detach -quiet "$mount" || true
  rm -rf "$work" "$rex_app.new"
  return "$status"
}

# Install Rex if it's missing, or update it when the feed has a newer build.
rex_update_app() {
  local release latest url installed rex
  if ! release="$(rex_latest_release)" || [[ -z "$release" ]]; then
    mark_fail "Could not read the Rex update feed ($(rex_appcast_url))"
    return 1
  fi
  read -r latest url <<<"$release"
  installed="$(rex_installed_build || true)"

  if [[ -n "$installed" && "$installed" -ge "$latest" ]]; then
    mark_ok "Rex is up to date (build $installed)"
    return 0
  fi
  if [[ -n "$installed" ]] && rex_running; then
    # Replacing a running app is unsafe; ask it to update itself. It
    # relaunches, and sessions survive because they live in the server.
    if rex="$(rex_cli)" && "$rex" "do" client.update.accept >/dev/null 2>&1; then
      mark_ok "Rex is installing build $latest (from $installed) and will relaunch"
    else
      mark_warn "Rex build $latest is out; use Rex > Install Update, or quit Rex and run: dot update --only rex"
    fi
    return 0
  fi
  if rex_install_dmg "$url"; then
    mark_ok "Installed Rex build $latest"
  else
    mark_fail "Could not install Rex"
    return 1
  fi
}

# Config check and reload, terminfo, agent skill and hooks. Needs the CLI,
# which Rex installs the first time the app runs.
rex_setup() {
  local rex rc=0
  if ! rex="$(rex_cli)"; then
    mark_warn "rex CLI not found; open Rex once, then run: dot init --only rex"
    return 0
  fi
  if ! "$rex" config check >/dev/null 2>&1; then
    mark_fail "Rex config has errors (run: rex config check)"
    rc=1
  elif "$rex" --autostart=false server status >/dev/null 2>&1; then
    "$rex" --autostart=false config reload >/dev/null 2>&1 && mark_ok "Rex config is valid and reloaded"
  else
    mark_ok "Rex config is valid"
  fi
  if "$rex" terminfo status 2>/dev/null | grep -q '^Ready'; then
    mark_ok "Rex terminfo is set up"
  elif "$rex" terminfo setup >/dev/null; then
    mark_ok "Installed Rex terminfo (xterm-rex) and its ssh guard"
  else
    mark_fail "rex terminfo setup failed"
    rc=1
  fi
  if "$rex" skill setup >/dev/null; then
    mark_ok "Rex agent skill and hooks are set up"
  else
    mark_warn "rex skill setup failed; run it by hand to see why"
  fi
  return "$rc"
}

component_rex_install() {
  if [[ -d "$rex_app" ]]; then
    mark_ok "Rex is installed (build $(rex_installed_build))"
  else
    rex_update_app || return 1
  fi
  rex_setup
}

component_rex_update() {
  rex_update_app || return 1
  rex_setup
}

rex_config_ok() { local rex; rex="$(rex_cli)" && "$rex" config check; }
rex_terminfo_ok() { local rex; rex="$(rex_cli)" && "$rex" terminfo status 2>/dev/null | grep -q '^Ready'; }
rex_skill_ok() {
  local rex status
  rex="$(rex_cli)" && status="$("$rex" skill status 2>/dev/null)" || return 1
  ! grep -qE '^ +(skill|hook) +(missing|outdated|stale)' <<<"$status"
}

component_rex_check() {
  check_item --warn --hint "dot init --only rex" "Rex is installed" test -d "$rex_app"
  check_item --warn --hint "open Rex once" "rex CLI is available" rex_cli
  check_item --warn --hint "rex config check" "Rex config loads" rex_config_ok
  check_item --warn --hint "dot init --only rex" "Rex terminfo is set up" rex_terminfo_ok
  check_item --warn --hint "dot init --only rex" "Rex agent skill and hooks are set up" rex_skill_ok
}
