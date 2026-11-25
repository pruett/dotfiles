# macOS settings: Dock, trackpad, Cloudflare DNS on Wi-Fi, and Caps Lock as
# Control on every keyboard. Settings are written only when they differ, so a
# rerun changes nothing. Trackpad changes show up after logging out and in.
define_component macos darwin optional "macOS settings"

# One `defaults` setting per line: <domain> <key> <type> <value>.
# Domain "-g" is the global domain; "host:-g" is the global domain for this
# Mac only (defaults -currentHost).
macos_defaults() {
  cat <<'EOF'
com.apple.dock autohide bool true
com.apple.dock orientation string left
com.apple.dock magnification bool true
com.apple.AppleMultitouchTrackpad Clicking bool true
com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking bool true
host:-g com.apple.mouse.tapBehavior int 1
-g AppleEnableSwipeNavigateWithScrolls bool true
com.apple.AppleMultitouchTrackpad TrackpadThreeFingerHorizSwipeGesture int 1
com.apple.driver.AppleBluetoothMultitouch.trackpad TrackpadThreeFingerHorizSwipeGesture int 1
EOF
}

macos_dns_service="Wi-Fi"
macos_dns_servers="1.1.1.1 1.0.0.1 2606:4700:4700::1111 2606:4700:4700::1001"

# Caps Lock (HID usage 0x39) -> Left Control (0xE0) for every keyboard.
# hidutil's mapping lasts until logout, so a launch agent sets it at login.
capslock_label="local.capslock-to-control"
capslock_plist="$HOME/Library/LaunchAgents/$capslock_label.plist"
capslock_mapping='{"UserKeyMapping":[{"HIDKeyboardModifierMappingSrc":0x700000039,"HIDKeyboardModifierMappingDst":0x7000000E0}]}'

# defaults read prints bools as 1/0.
macos_expected() {
  if [[ "$1" == bool ]]; then
    [[ "$2" == true ]] && echo 1 || echo 0
  else
    echo "$2"
  fi
}

# Read or write one setting; "host:" domains use defaults -currentHost.
macos_read() {
  local domain="$1" key="$2"
  if [[ "$domain" == host:* ]]; then
    defaults -currentHost read "${domain#host:}" "$key" 2>/dev/null
  else
    defaults read "$domain" "$key" 2>/dev/null
  fi
}

macos_write() {
  local domain="$1" key="$2" type="$3" value="$4"
  if [[ "$domain" == host:* ]]; then
    defaults -currentHost write "${domain#host:}" "$key" "-$type" "$value"
  else
    defaults write "$domain" "$key" "-$type" "$value"
  fi
}

macos_apply_defaults() {
  local domain key type value changed=0 dock=false
  while read -r domain key type value; do
    [[ "$(macos_read "$domain" "$key" || true)" == "$(macos_expected "$type" "$value")" ]] && continue
    macos_write "$domain" "$key" "$type" "$value" || { mark_fail "Could not write $domain $key"; return 1; }
    changed=$((changed + 1))
    [[ "$domain" == com.apple.dock ]] && dock=true
  done < <(macos_defaults)
  [[ "$dock" == true ]] && killall Dock 2>/dev/null
  if [[ $changed -eq 0 ]]; then
    mark_ok "Dock and trackpad settings are set"
  else
    mark_ok "Wrote $changed Dock/trackpad setting(s); trackpad changes apply after logging out and in"
  fi
}

macos_defaults_ok() {
  local domain key type value
  while read -r domain key type value; do
    [[ "$(macos_read "$domain" "$key" || true)" == "$(macos_expected "$type" "$value")" ]] || return 1
  done < <(macos_defaults)
}

macos_dns_ok() {
  [[ "$(networksetup -getdnsservers "$macos_dns_service" 2>/dev/null | tr '\n' ' ')" == "$macos_dns_servers " ]]
}

macos_apply_dns() {
  if macos_dns_ok; then
    mark_ok "$macos_dns_service DNS is Cloudflare"
    return 0
  fi
  # shellcheck disable=SC2086,SC2024 # one argument per server; </dev/tty is for the password prompt
  if networksetup -setdnsservers "$macos_dns_service" $macos_dns_servers 2>/dev/null \
    || { has_tty && sudo networksetup -setdnsservers "$macos_dns_service" $macos_dns_servers </dev/tty; }; then
    mark_ok "Set $macos_dns_service DNS to Cloudflare"
  else
    mark_warn "Could not set $macos_dns_service DNS (needs an admin password; run: dot init --only macos)"
  fi
}

capslock_plist_content() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by dot (dot/lib/components/macos.sh): Caps Lock -> Control at login. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>$capslock_label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/hidutil</string>
    <string>property</string>
    <string>--set</string>
    <string>$capslock_mapping</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
}

capslock_active() {
  hidutil property --get UserKeyMapping 2>/dev/null | grep -q '30064771129'
}

capslock_agent_ok() {
  [[ "$(cat "$capslock_plist" 2>/dev/null)" == "$(capslock_plist_content)" ]]
}

macos_apply_capslock() {
  if ! capslock_agent_ok; then
    mkdir -p "$(dirname "$capslock_plist")"
    capslock_plist_content >"$capslock_plist"
    launchctl bootout "gui/$(id -u)/$capslock_label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$capslock_plist" || { mark_fail "Could not load $capslock_plist"; return 1; }
  fi
  capslock_active || hidutil property --set "$capslock_mapping" >/dev/null || { mark_fail "hidutil could not remap Caps Lock"; return 1; }
  mark_ok "Caps Lock is Control on every keyboard (set at login by $capslock_label)"
}

component_macos_install() {
  local rc=0
  macos_apply_defaults || rc=1
  macos_apply_dns
  macos_apply_capslock || rc=1
  return "$rc"
}

component_macos_check() {
  check_item --warn --hint "dot init --only macos" "Dock and trackpad settings are set" macos_defaults_ok
  check_item --warn --hint "dot init --only macos" "$macos_dns_service DNS is Cloudflare" macos_dns_ok
  check_item --warn --hint "dot init --only macos" "Caps Lock launch agent is installed" capslock_agent_ok
  check_item --warn --hint "dot init --only macos" "Caps Lock is Control now" capslock_active
}
