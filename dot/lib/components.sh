# Components: everything dot installs, updates and checks. Each is one file,
# lib/components/<name>.sh, that calls define_component and defines:
#
#   component_<name>_install  required; safe to run again (skips what is done)
#   component_<name>_update   optional; without it, `dot update` runs install
#   component_<name>_check    required; prints ✓/⚠/✗ marks, returns 1 only
#                             for a real problem
#
# `dot init`, `dot update` and `dot doctor` walk component_order, so a tool
# can't be installed by init and then forgotten by update or doctor.
component_order=(xcode homebrew packages github git_identity links skills rex)

component_names=()
component_platforms=()
component_required=()
component_descs=()

case "$(uname -s)" in
  Darwin) dot_os=darwin ;;
  *) dot_os=linux ;;
esac

# define_component <name> <all|darwin|linux> <required|optional> <description>
# A required component that fails stops init and update, and makes doctor
# exit 1. An optional one only warns.
define_component() {
  component_names+=("$1")
  component_platforms+=("$2")
  component_required+=("$3")
  component_descs+=("$4")
}

load_components() {
  local name
  for name in "${component_order[@]}"; do
    # shellcheck source=/dev/null
    source "$dot_dir/lib/components/$name.sh"
  done
}

# --only and --skip are stored as ",a,b," so a name matches as ",name,".
only=""
skip=""
dry_run=false

# parse_component_options <command> [options]: the options init, update and
# doctor share. Only init and update take --dry-run.
parse_component_options() {
  local command="$1" names name
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --only|--skip)
        [[ $# -ge 2 ]] || fail "$1 needs a comma-separated list of components (see: dot components)"
        [[ "$1" == --only ]] && only=",$2," || skip=",$2,"
        shift 2
        ;;
      --only=*) only=",${1#--only=},"; shift ;;
      --skip=*) skip=",${1#--skip=},"; shift ;;
      --dry-run)
        [[ "$command" != doctor ]] || fail "dot doctor changes nothing; it has no --dry-run"
        dry_run=true
        shift
        ;;
      -h|--help) usage; exit 0 ;;
      *) fail "Unknown option for dot $command: $1" ;;
    esac
  done
  names="${only//,/ } ${skip//,/ }"
  for name in $names; do
    [[ " ${component_order[*]} " == *" $name "* ]] \
      || fail "Unknown component: $name. Components: ${component_order[*]}"
  done
}

component_selected() {
  [[ -z "$only" || "$only" == *",$1,"* ]] && [[ "$skip" != *",$1,"* ]]
}

platform_matches() {
  [[ "$1" == all || "$1" == "$dot_os" ]]
}

# run_phase <install|update|check>: run that step of every selected component
# for this platform, in order, then print a summary. Returns 1 if a required
# component failed; install and update stop at the first one.
run_phase() {
  local phase="$1" i name fn status before rc=0 summary=""
  for i in "${!component_names[@]}"; do
    name="${component_names[$i]}"
    component_selected "$name" || continue
    platform_matches "${component_platforms[$i]}" || continue

    fn="component_${name}_${phase}"
    if [[ "$phase" == update ]] && ! declare -F "$fn" >/dev/null; then
      fn="component_${name}_install"
    fi
    if [[ "$dry_run" == true ]]; then
      info "would run $fn  (${component_descs[$i]})"
      continue
    fi

    heading "${component_descs[$i]} ($name)"
    before=$dot_warnings
    if "$fn"; then
      status=ok
      [[ $dot_warnings -gt $before ]] && status=warn
    elif [[ "${component_required[$i]}" == required ]]; then
      status=fail
      rc=1
    else
      status=warn
      dot_warnings=$((dot_warnings + 1))
    fi
    summary+="$status $name"$'\n'

    if [[ "$status" == fail && "$phase" != check ]]; then
      print_summary "$summary"
      warn "Stopped: $name is required. Fix it, then run: dot $(phase_command "$phase") --only $name"
      return 1
    fi
  done
  [[ "$dry_run" == true ]] && return 0
  print_summary "$summary"
  return "$rc"
}

phase_command() {
  case "$1" in
    install) echo init ;;
    check) echo doctor ;;
    *) echo "$1" ;;
  esac
}

print_summary() {
  local status name
  [[ -n "$1" ]] || { info "No components selected for $dot_os."; return 0; }
  heading Summary
  while read -r status name; do
    case "$status" in
      ok) mark_ok "$name" ;;
      warn) printf '  %s⚠%s %s\n' "$c_yellow" "$c_reset" "$name" ;;
      fail) mark_fail "$name" ;;
    esac
  done <<<"$1"
}
