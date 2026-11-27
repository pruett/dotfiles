# Terminal output: plain lines, section headings, the ✓/⚠/✗ marks that
# components print, and prompts that read from the terminal even when stdin
# is a pipe.

if [[ -t 1 ]]; then
  c_bold=$'\033[1m' c_green=$'\033[32m' c_yellow=$'\033[33m' c_red=$'\033[31m' c_reset=$'\033[0m'
else
  c_bold="" c_green="" c_yellow="" c_red="" c_reset=""
fi

info() { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
fail() { warn "$*"; exit 1; }
heading() { printf '\n%s==> %s%s\n' "$c_bold" "$*" "$c_reset"; }

# Count of ⚠ marks so far; the runner compares it before and after each
# component to tell "ok" from "ok with warnings".
dot_warnings=0

mark_ok() { printf '  %s✓%s %s\n' "$c_green" "$c_reset" "$*"; }
mark_warn() {
  dot_warnings=$((dot_warnings + 1))
  printf '  %s⚠%s %s\n' "$c_yellow" "$c_reset" "$*"
}
mark_fail() { printf '  %s✗%s %s\n' "$c_red" "$c_reset" "$*"; }

# check_item [--warn] [--hint <fix>] <label> <command...>
# Runs the command quietly and prints ✓ or, on failure, ✗ (returns 1) or, with
# --warn, ⚠ (returns 0). The hint should be the command that fixes it.
check_item() {
  local level=fail hint=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --warn) level=warn; shift ;;
      --hint) hint="$2"; shift 2 ;;
      *) break ;;
    esac
  done
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    mark_ok "$label"
    return 0
  fi
  label="$label: no"
  [[ -n "$hint" ]] && label="$label (run: $hint)"
  if [[ "$level" == warn ]]; then
    mark_warn "$label"
    return 0
  fi
  mark_fail "$label"
  return 1
}

# --headless (dot_headless, set in components.sh) counts as no terminal.
has_tty() { [[ "${dot_headless:-false}" != true ]] && { : </dev/tty; } 2>/dev/null; }

# ask <prompt> <variable>: read one line from the terminal; returns 1 without one.
ask() {
  local reply
  has_tty || return 1
  read -rp "$1" reply </dev/tty || return 1
  printf -v "$2" '%s' "$reply"
}

confirm() {
  local reply=""
  ask "$1 [y/N] " reply || return 1
  [[ "$reply" == [yY]* ]]
}
