# dot skills: add, list and update agent skills with the upstream `skills` CLI.

run_skills_cli() {
  # The skills CLI stores its global lock at $XDG_STATE_HOME/skills/.skill-lock.json
  # when that variable is set. Clear it so the lock resolves to
  # $managed_home/.agents/.skill-lock.json and stays tracked in this repo.
  npm_config_cache="$npm_cache" HOME="$managed_home" \
    command env -u XDG_STATE_HOME npx --yes skills "$@"
}

# The upstream CLI auto-detects Pi and Claude Code under $managed_home and links
# updated skills into .pi/agent/skills and .claude/skills inside this repo. Pi
# reads ~/.agents/skills directly and link_claude_skills owns ~/.claude/skills,
# so drop those links to keep them out of the repo.
prune_agent_links() {
  local dir link
  for dir in "$managed_home/.pi/agent/skills" "$managed_home/.claude/skills"; do
    [[ -d "$dir" && ! -L "$dir" ]] || continue
    for link in "$dir"/*; do
      [[ -L "$link" ]] || continue
      case "$(readlink "$link")" in
        */.agents/skills/*) rm "$link" ;;
      esac
    done
    rmdir "$dir" 2>/dev/null || true
  done
}

# pstack skills come from the Claude Code copy in cursor/plugins and are
# written for Cursor. Only part of pstack is installed; docs/harness/local.md
# (hand-written) maps the skills left out to local ones, for any harness.
# After add or update, from the commit in the lockfile:
#   - copy docs/harness/claude-code.md (Cursor -> Claude Code names), dropping
#     the plugin's `pstack:` prefix, and print any change to it for review,
#     since a new kind of setup step there is not applied here;
#   - copy agents/*.md to docs/harness/agents/, which local.md points to;
#   - point each skill's "In Claude Code, read the adapter" line at local.md;
#   - list upstream skills that are neither installed nor in pstack_skip.
pstack_path="harness/pstack/claude-code"
pstack_skip=(poteto-mode arena swarm setup-pstack poteto-help make-bot-ui automate-me)
pstack_adapter_line='In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. It maps the Cursor names in pstack skills to Claude Code.'
pstack_local_line='Read [the local pstack adapter](../../docs/harness/local.md) once per session before you follow this skill. It maps Cursor names and pstack skills not installed here to this setup.'

sync_pstack() {
  local lock="$managed_home/.agents/.skill-lock.json"
  local commit url src up doc new name file missing=()

  commit="$(jq -r --arg p "$pstack_path/skills/" '
    [.skills[] | select(.skillPath | startswith($p))] | max_by(.updatedAt) | .commit // empty
  ' "$lock")"
  [[ -n "$commit" ]] || return 0
  url="$(jq -r --arg c "$commit" '[.skills[] | select(.commit == $c)][0].sourceUrl' "$lock")"

  src="$(mktemp -d)"
  # Clear the trap as it fires: a RETURN trap outlives the function and would
  # fire again when the caller returns, after $src is gone (set -u).
  trap 'rm -rf "$src"; trap - RETURN' RETURN
  git -C "$src" init -q
  git -C "$src" remote add origin "$url"
  git -C "$src" sparse-checkout set "$pstack_path"
  git -C "$src" fetch -q --depth 1 --filter=blob:none origin "$commit"
  git -C "$src" checkout -q FETCH_HEAD
  up="$src/$pstack_path"

  doc="$managed_home/.agents/docs/harness/claude-code.md"
  new="$src/claude-code.md"
  {
    # shellcheck disable=SC2016 # backticks are Markdown
    printf '<!-- Copied by `dot skills` from %s/blob/%s/%s/docs/harness/claude-code.md, with the `pstack:` prefix dropped. pstack skills link here as ../../docs/harness/claude-code.md; ~/.claude/docs links to this folder so that path resolves. -->\n\n' \
      "${url%.git}" "$commit" "$pstack_path"
    sed -E 's/pstack:([<a-z])/\1/g' "$up/docs/harness/claude-code.md"
  } >"$new"
  mkdir -p "$(dirname "$doc")"
  if [[ ! -f "$doc" ]] || ! diff -q <(tail -n +3 "$doc") <(tail -n +3 "$new") >/dev/null; then
    printf 'pstack claude-code.md changed. Review for setup steps this command does not apply:\n'
    diff -u --label old --label new <(tail -n +3 "$doc" 2>/dev/null) <(tail -n +3 "$new") || true
  fi
  cp "$new" "$doc"

  mkdir -p "$managed_home/.agents/docs/harness/agents"
  cp "$up"/agents/*.md "$managed_home/.agents/docs/harness/agents/"

  for file in "$managed_home/.agents/skills"/*/SKILL.md; do
    grep -qF "$pstack_adapter_line" "$file" || continue
    PSTACK_OLD="$pstack_adapter_line" PSTACK_NEW="$pstack_local_line" \
      perl -pi -e 's/\Q$ENV{PSTACK_OLD}\E/$ENV{PSTACK_NEW}/' "$file"
  done

  for file in "$up"/skills/*; do
    name="${file##*/}"
    [[ -e "$managed_home/.agents/skills/$name" || " ${pstack_skip[*]} " == *" $name "* ]] || missing+=("$name")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf 'pstack skills upstream but not installed: %s\n' "${missing[*]}"
    printf 'Add with: dot skills add %s/tree/main/%s --skill %s\n' "${url%.git}" "$pstack_path" "${missing[*]}"
  fi
}

list_skills() {
  local skill_file name description found=false

  for skill_file in "$managed_home/.agents/skills"/*/SKILL.md; do
    [[ -f "$skill_file" ]] || continue
    found=true
    name="$(basename "$(dirname "$skill_file")")"
    description="$(awk '
      function clean(value) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) {
          value = substr(value, 2, length(value) - 2)
        }
        return value
      }
      NR == 1 && $0 == "---" { frontmatter = 1; next }
      frontmatter && collecting && /^[[:space:]]+/ {
        line = clean($0)
        description = description (description ? " " : "") line
        next
      }
      frontmatter && collecting { collecting = 0; print description; exit }
      frontmatter && $0 == "---" { exit }
      frontmatter && /^description:[[:space:]]*/ {
        sub(/^description:[[:space:]]*/, "")
        if ($0 ~ /^[>|][-+]?[[:space:]]*$/) {
          collecting = 1
          next
        }
        print clean($0)
        exit
      }
      END { if (collecting) print description }
    ' "$skill_file")"

    description="${description//$'\n'/ }"
    if [[ ${#description} -gt 80 ]]; then
      description="${description:0:77}..."
    elif [[ -z "$description" ]]; then
      description="(no description)"
    fi
    printf '%-24s %s\n' "$name" "$description"
  done

  if [[ "$found" == false ]]; then
    printf 'No skills installed.\n'
  fi
}

cmd_skills() {
  local sub="${1:-list}"
  [[ $# -gt 0 ]] && shift
  link_plugin_skills
  case "$sub" in
    list|ls)
      [[ $# -eq 0 ]] || fail "Usage: dot skills list"
      list_skills
      ;;
    add)
      [[ $# -gt 0 ]] || fail "Usage: dot skills add <source> [options]"
      run_skills_cli add "$@" --global --agent zed --yes
      prune_agent_links
      sync_pstack
      link_claude_skills
      ;;
    update|upgrade)
      run_skills_cli update --global --yes "$@"
      prune_agent_links
      sync_pstack
      link_claude_skills
      ;;
    *)
      warn "Unknown skills command: $sub"
      usage >&2
      exit 2
      ;;
  esac
}

