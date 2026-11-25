# dot init: install every component (a new machine). Safe to run again.

cmd_init() {
  parse_component_options init "$@"
  run_phase install
}
