# Linking: stow the home/ package into ~, the folded directories, agent skill
# links for Claude Code. dot update and dot sync run it after pulling.

# .stowrc sets --no-folding, so stow links file by file and a file added to the
# repo only appears after relinking. These directories (relative to the home
# package) are linked as one directory symlink instead, so new files appear
# immediately. Only list directories no app writes into, or those writes land
# in the repo.
folded_dirs=(
  .agents/skills
  .config/zsh
)

# Paths in the home package that stay in the repo and never get a link in ~.
# Passed to stow as --ignore, which adds to stow's built-in ignore list; a
# .stow-local-ignore file would replace that list instead.
ignored_paths=(
  .gitconfig.local.sample
)

# Also never linked on Linux (exe.dev VMs): files that only work on this Mac.
# .codex/config.toml has /Users/... and /Applications paths; gpg-agent.conf
# points at pinentry-mac.
if [[ "$(uname -s)" != Darwin ]]; then
  ignored_paths+=(
    .codex/config.toml
    .gnupg
  )
fi

# ------------------------------------------------------------------------------
# Linking: stow packages and folded directories
# ------------------------------------------------------------------------------

# A stow package is a top-level directory with tracked files, except
# dot-directories, dot/ (this CLI) and packages/ (package lists).
# Gitignored directories (local scratch) are never stowed.
packages() {
  git -C "$repo_root" ls-files | sed -n 's|^\([^./][^/]*\)/.*|\1|p' | sort -u | grep -vxE 'dot|packages'
}

# Sets stow_args for a package. Bash 3.2 (macOS) has no mapfile, so this fills
# a global array instead of printing.
set_stow_args() {
  local package="$1" dir
  # --no-folding is also in .stowrc, but stow reads that only from the current
  # directory, and dot runs from anywhere (first boot on a VM runs from ~).
  stow_args=(--dir="$repo_root" --target="$target" --no-folding)
  if [[ "$package" == home ]]; then
    for dir in "${folded_dirs[@]}" "${ignored_paths[@]}"; do
      stow_args+=("--ignore=(^|/)${dir//./\\.}")
    done
  fi
}

# Move aside real files that would block stow (e.g. a default ~/.zshrc). The first
# two sed patterns cover the conflict messages of stow >= 2.4 and older releases;
# the third covers a symlink stow didn't make (exe.dev's ~/.claude/CLAUDE.md).
backup_conflicts() {
  local package="$1" conflict path
  set_stow_args "$package"
  while IFS= read -r conflict; do
    [[ -n "$conflict" ]] || continue
    path="$target/$conflict"
    if [[ -e "$path" || -L "$path" ]]; then
      warn "Backing up $path -> $path.pre-dotfiles"
      mv "$path" "$path.pre-dotfiles"
    fi
  done < <(stow --no --verbose "${stow_args[@]}" "$package" 2>&1 \
             | sed -n \
                 -e 's/.*over existing target \(.*\) since neither a link nor a directory.*/\1/p' \
                 -e 's/.*existing target is neither a directory nor owned by stow: //p' \
                 -e 's/.*existing target is not owned by stow: //p' \
             || true)
}

stow_package() {
  local package="$1"
  backup_conflicts "$package"
  set_stow_args "$package"
  stow --restow "${stow_args[@]}" "$package"
}

# Relative link target from $target/<dir> to the repo copy, like stow writes.
folded_link_target() {
  local dir="$1" up="" slashes
  # One "../" per slash climbs from the link's parent directory back to $target.
  slashes="${dir//[^\/]/}"
  while [[ ${#up} -lt $((${#slashes} * 3)) ]]; do up+="../"; done
  if [[ "$repo_root" == "$target"/* ]]; then
    printf '%s%s/home/%s\n' "$up" "${repo_root#"$target"/}" "$dir"
  else
    printf '%s/home/%s\n' "$repo_root" "$dir"
  fi
}

# True when $1 holds nothing but symlinks into the repo and empty directories,
# i.e. leftovers from file-by-file linking that are safe to replace.
only_repo_links() {
  local entry
  while IFS= read -r -d '' entry; do
    if [[ -L "$entry" ]]; then
      [[ "$(readlink "$entry")" == *"${repo_root##*/}/"* ]] || return 1
    elif [[ ! -d "$entry" ]]; then
      return 1
    fi
  done < <(find "$1" -mindepth 1 -print0)
}

link_folded_dir() {
  local dir="$1"
  local link="$target/$dir"
  local expected
  expected="$(folded_link_target "$dir")"

  [[ -d "$repo_root/home/$dir" ]] || return 0
  if [[ -L "$link" ]]; then
    [[ "$(readlink "$link")" == "$expected" ]] && return 0
    rm "$link"
  elif [[ -d "$link" ]]; then
    if ! only_repo_links "$link"; then
      warn "Refusing to replace $link: it holds files that aren't links into the repo"
      return 1
    fi
    rm -r "$link"
  elif [[ -e "$link" ]]; then
    warn "Refusing to replace non-directory $link"
    return 1
  fi
  mkdir -p "$(dirname "$link")"
  ln -s "$expected" "$link"
  info "Linked $link -> $expected"
}

# Links in ~ for ignored_paths, left over from before they were ignored.
ignored_links() {
  local path link
  for path in "${ignored_paths[@]}"; do
    link="$target/$path"
    if [[ -L "$link" && "$(readlink "$link")" == *"${repo_root##*/}/"* ]]; then
      printf '%s\n' "$link"
    fi
  done
}

# Links into the repo whose file was deleted or moved. Stow leaves these behind.
dangling_links() {
  local package entry
  for package in $(packages); do
    for entry in "$repo_root/$package"/* "$repo_root/$package"/.[!.]*; do
      [[ -e "$entry" || -L "$entry" ]] || continue
      entry="$target/${entry##*/}"
      [[ -e "$entry" || -L "$entry" ]] || continue
      find "$entry" -type l ! -exec test -e {} \; -print 2>/dev/null || true
    done
  done | while IFS= read -r entry; do
    if [[ "$(readlink "$entry")" == *"${repo_root##*/}/"* ]]; then
      printf '%s\n' "$entry"
    fi
  done
}

# ------------------------------------------------------------------------------
# Linking: agent skills
# ------------------------------------------------------------------------------

# Plugins under .plugins/<plugin>/skills own their skill files so each plugin
# is self-contained when cloned on its own. Link them back into
# home/.agents/skills so every agent sees them like any other skill.
link_plugin_skills() {
  local agents_dir="$managed_home/.agents/skills"
  local source plugin name link expected current

  mkdir -p "$agents_dir"

  for source in "$repo_root"/.plugins/*/skills/*; do
    [[ -d "$source" && ! -L "$source" ]] || continue
    name="${source##*/}"
    plugin="${source%/skills/*}"
    plugin="${plugin##*/}"
    link="$agents_dir/$name"
    expected="../../../.plugins/$plugin/skills/$name"

    if [[ -L "$link" ]]; then
      current="$(readlink "$link")"
      [[ "$current" == "$expected" ]] && continue
      info "Updating $link -> $expected"
      ln -sfn "$expected" "$link"
    elif [[ -e "$link" ]]; then
      warn "Refusing to replace non-symlink: $link (also in .plugins/$plugin)"
      return 1
    else
      info "Linking $link -> $expected"
      ln -s "$expected" "$link"
    fi
  done

  # Remove links into .plugins whose skill was deleted or moved.
  for link in "$agents_dir"/*; do
    [[ -L "$link" && ! -e "$link" ]] || continue
    case "$(readlink "$link")" in
      ../../../.plugins/*)
        info "Removing stale link $link"
        rm "$link"
        ;;
    esac
  done
}

# Codex and Pi read ~/.agents/skills directly; only Claude Code needs one link
# per skill in ~/.claude/skills (not in this repo, since Claude Code writes its
# own files there). A real folder Claude Code created is never replaced.
link_claude_skills() {
  local target_dir="$target/.claude/skills"
  local source name link expected rc=0

  mkdir -p "$target_dir"

  for source in "$managed_home/.agents/skills"/*; do
    [[ -d "$source" ]] || continue
    name="${source##*/}"
    link="$target_dir/$name"
    expected="../../.agents/skills/$name"

    if [[ -L "$link" ]]; then
      [[ "$(readlink "$link")" == "$expected" ]] && continue
      info "Updating $link -> $expected"
      ln -sfn "$expected" "$link"
    elif [[ -e "$link" ]]; then
      warn "Refusing to replace non-symlink: $link"
      rc=1
    else
      info "Linking $link -> $expected"
      ln -s "$expected" "$link"
    fi
  done

  # Remove links made here whose skill is gone.
  for link in "$target_dir"/*; do
    [[ -L "$link" ]] || continue
    name="${link##*/}"
    if [[ "$(readlink "$link")" == "../../.agents/skills/$name" && ! -e "$managed_home/.agents/skills/$name" ]]; then
      info "Removing stale link $link"
      rm "$link"
    fi
  done
  return "$rc"
}

# Skills with no link, or a stale one, in ~/.claude/skills.
claude_skill_changes() {
  local source name link
  for source in "$managed_home/.agents/skills"/*; do
    [[ -d "$source" ]] || continue
    name="${source##*/}"
    link="$target/.claude/skills/$name"
    [[ -L "$link" && "$(readlink "$link")" == "../../.agents/skills/$name" ]] || printf '%s\n' "$link"
  done
  for link in "$target/.claude/skills"/*; do
    [[ -L "$link" && ! -e "$link" ]] && printf '%s\n' "$link"
  done
  return 0
}

# Linux only (exe.dev VMs): the link that `home/.agents/README.md` relies on
# (skills reach their docs through ~/.claude/docs), and the clean-up of a
# skills-sync link from before dot took over.
link_linux_extras() {
  mkdir -p "$target/.claude"
  [[ -e "$target/.claude/docs" || -L "$target/.claude/docs" ]] || ln -s ../.agents/docs "$target/.claude/docs"
  [[ -L "$target/.local/bin/skills-sync" ]] && rm "$target/.local/bin/skills-sync"
  return 0
}

link_all() {
  local package dir entry rc=0
  for package in $(packages); do
    stow_package "$package"
    info "Stowed $package"
  done
  # A refused folder doesn't stop the rest; link exits 1 at the end instead.
  for dir in "${folded_dirs[@]}"; do
    link_folded_dir "$dir" || rc=1
  done
  while IFS= read -r entry; do
    rm "$entry"
    info "Removed dangling link $entry"
  done < <(dangling_links)
  while IFS= read -r entry; do
    rm "$entry"
    info "Removed link to ignored path $entry"
  done < <(ignored_links)
  link_plugin_skills || rc=1
  link_claude_skills || rc=1
  [[ "$(uname -s)" == Darwin ]] || link_linux_extras
  return "$rc"
}

link_status() {
  local package dir link out clean=true
  for package in $(packages); do
    set_stow_args "$package"
    out="$(stow --no --verbose "${stow_args[@]}" "$package" 2>&1 | grep -v 'simulation mode' || true)"
    if [[ -n "$out" ]]; then
      clean=false
      printf '%s: pending stow changes\n%s\n' "$package" "$out"
    fi
  done
  for dir in "${folded_dirs[@]}"; do
    link="$target/$dir"
    if [[ ! -L "$link" || "$(readlink "$link")" != "$(folded_link_target "$dir")" ]]; then
      clean=false
      printf '%s: not linked as a directory\n' "$link"
    fi
  done
  out="$(dangling_links)"
  if [[ -n "$out" ]]; then
    clean=false
    printf 'Dangling links:\n%s\n' "$out"
  fi
  out="$(ignored_links)"
  if [[ -n "$out" ]]; then
    clean=false
    printf 'Links to ignored paths:\n%s\n' "$out"
  fi
  out="$(claude_skill_changes)"
  if [[ -n "$out" ]]; then
    clean=false
    printf 'Claude Code skill links missing or stale:\n%s\n' "$out"
  fi
  info "Linked as whole directories: ${folded_dirs[*]/#/~/}"
  info "Never linked: ${ignored_paths[*]}"
  if [[ "$clean" == true ]]; then
    info "All packages linked."
  else
    info "Run 'dot link' to fix."
    return 1
  fi
}

