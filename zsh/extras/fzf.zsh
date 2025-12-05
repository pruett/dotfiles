# ========================================
# FZF Configuration
# ========================================
# A command-line fuzzy finder for enhanced shell experience
# Dependencies are checked by depcheck.zsh - assumes all tools are available

# ----------------------------------------
# Core FZF Setup
# ----------------------------------------

# FZF keybinding initialization is deferred to .zshrc's zvm_after_init() hook
# to prevent zsh-vi-mode from overwriting FZF keybindings.
#
# Default keybindings (applied after vi-mode loads):
# - Ctrl+R: Search command history
# - Ctrl+T: Search files in current directory
# - Alt+C: Change to selected directory
#
# This file only contains FZF configuration (opts, commands, previews, functions)

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
# Function Aliases
# ----------------------------------------
# Custom FZF functions are autoloaded from $DOTFILES/zsh/functions/
# and registered in .zshrc via: autoload -Uz fzf-file fzf-cd fzf-git-branch fzf-env

# Convenient aliases for custom functions
alias ff='fzf-file'
alias fcd='fzf-cd'
alias fgb='fzf-git-branch'
alias fenv='fzf-env'
