# dot doctor: check every component. Exits 1 when a required one fails; each
# ✗ or ⚠ line names the command that fixes it.

cmd_doctor() {
  parse_component_options doctor "$@"
  run_phase check
}
