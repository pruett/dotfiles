# ========================================
# FZF Configuration
# ========================================
# A command-line fuzzy finder for enhanced shell experience
# Dependencies are checked by depcheck.zsh - assumes all tools are available

# ----------------------------------------
# Core FZF Setup
# ----------------------------------------

# Initialize FZF with default keybindings:
# - Ctrl+R: Search command history
# - Ctrl+T: Search files in current directory
# - Alt+C: Change to selected directory
eval "$(fzf --zsh)"

# ----------------------------------------
# FZF Configuration
# ----------------------------------------

# Default options for all FZF commands
export FZF_DEFAULT_OPTS='
    --height 50%
    --layout=reverse
    --info=inline
    --border=rounded
    --margin=1
    --padding=1
    --color=fg:#d0d0d0,bg:#121212,hl:#5f87af
    --color=fg+:#d0d0d0,bg+:#262626,hl+:#5fd7ff
    --color=info:#afaf87,prompt:#d7005f,pointer:#af5fff
    --color=marker:#87ff00,spinner:#af5fff,header:#87afaf
'

# ----------------------------------------
# Smart File Finding
# ----------------------------------------

# Use fd for fast file/directory finding
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git --exclude node_modules'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git --exclude node_modules'

# ----------------------------------------
# Preview Configuration
# ----------------------------------------

# File preview with bat (syntax highlighting)
export FZF_CTRL_T_OPTS="
    --preview 'bat --color=always --style=numbers --line-range=:500 {}'
    --preview-window=right:50%:wrap
"

# Directory preview with eza
export FZF_ALT_C_OPTS="
    --preview 'eza --tree --level=2 --color=always --icons {}'
    --preview-window=right:50%:wrap
"

# Disable preview for history search (Ctrl+R)
export FZF_CTRL_R_OPTS="--no-preview"

# ----------------------------------------
# Custom Functions
# ----------------------------------------

# Enhanced file search with preview
fzf-file() {
    local file
    file=$(fzf --query="$1" --select-1 --exit-0)
    [[ -n "$file" ]] && ${EDITOR:-vim} "$file"
}

# Enhanced directory navigation
fzf-cd() {
    local dir
    dir=$(fd --type d --hidden --follow --exclude .git --exclude node_modules . "${1:-.}" | fzf --query="$1" --select-1 --exit-0)
    [[ -n "$dir" ]] && cd "$dir"
}

# Git branch switcher
fzf-git-branch() {
    local branch
    branch=$(git branch --all | grep -v HEAD | sed 's/.* //' | sed 's#remotes/[^/]*/##' | sort -u | fzf --query="$1" --select-1 --exit-0)
    [[ -n "$branch" ]] && git checkout "$branch"
}

# ----------------------------------------
# Aliases
# ----------------------------------------

# Environment variable browser
fzf-env() {
    local selection
    selection=$(env | sort | fzf --preview 'echo {} | cut -d= -f2-' --preview-label="Environment Variable Value")
    if [[ -n "$selection" ]]; then
        echo "$selection"
    fi
}

# Convenient aliases for custom functions
alias ff='fzf-file'
alias fcd='fzf-cd'
alias fgb='fzf-git-branch'
alias fenv='fzf-env'
