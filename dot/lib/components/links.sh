# Links from ~ into home/ (stow) and Claude Code skill links. On Linux
# (exe.dev boxes) only the agent skills and their CLIs. The work is in
# lib/links.sh, which `dot link` also runs.
define_component links all required "Links into ~"

component_links_install() {
  link_all
}

component_links_check() {
  local out
  if out="$(link_status 2>&1)"; then
    mark_ok "Everything is linked"
    return 0
  fi
  mark_fail "Links are out of date (run: dot link)"
  printf '%s\n' "$out" | sed 's/^/      /'
  return 1
}
