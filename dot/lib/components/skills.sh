# Agent skills in home/.agents/skills. They live in the repo, and the links
# component links them, so install has nothing to do. Update pulls new
# versions of the skills the lockfile tracks (`dot skills update`), which
# changes files in the repo: review and commit them. macOS only, so exe.dev
# boxes never make commits that `dot sync` would have to merge.
define_component skills darwin optional "Agent skills"

component_skills_install() {
  mark_ok "$(find "$managed_home/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ') skills in the repo; 'dot update' updates them"
}

component_skills_update() {
  local changes
  cmd_skills update || return 1
  changes="$(git -C "$repo_root" status --porcelain -- home/.agents)"
  if [[ -n "$changes" ]]; then
    mark_warn "Skill files changed; review and commit them (git status -- home/.agents)"
  else
    mark_ok "Skills are up to date"
  fi
}

component_skills_check() {
  check_item --warn --hint "dot package add node" "npx is installed (dot skills needs it)" command -v npx
}
