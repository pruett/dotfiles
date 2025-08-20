# ========================================
# Enhanced Tab Completions with FZF Integration
# ========================================

# ----------------------------------------
# Core Completion Setup
# ----------------------------------------

# Load Homebrew completions
if type brew &>/dev/null; then
  FPATH=/opt/homebrew/share/zsh-completions:$FPATH
  autoload -Uz compinit
  compinit
fi

# ----------------------------------------
# Basic Completion Behavior
# ----------------------------------------

# Disable default menu to allow fzf-tab to work
zstyle ':completion:*' menu no

# Case insensitive matching
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'

# Group completions by type
zstyle ':completion:*' group-name ''

# Show descriptions for completion groups
zstyle ':completion:*:descriptions' format '[%d]'

# ----------------------------------------
# FZF-Tab Integration
# ----------------------------------------

# Load fzf-tab plugin
source $DOTFILES/zsh/plugins/fzf-tab/fzf-tab.plugin.zsh

# ----------------------------------------
# Command-Specific Previews
# ----------------------------------------

# File/Directory operations - show file contents or directory listing
zstyle ':fzf-tab:complete:*:*' fzf-preview 'bat --color=always --style=numbers --line-range=:500 $realpath 2>/dev/null || eza --color=always --icons $realpath 2>/dev/null || ls -la $realpath'

# cd command - show directory contents
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza --tree --level=2 --color=always --icons $realpath'

# Git commands
zstyle ':fzf-tab:complete:git-checkout:*' fzf-preview 'git log --oneline --graph --date=short --pretty="format:%C(auto)%cd %h%d %s" $word'
zstyle ':fzf-tab:complete:git-log:*' fzf-preview 'git log --color=always $word'
zstyle ':fzf-tab:complete:git-show:*' fzf-preview 'git show --color=always $word'

# Process commands
zstyle ':fzf-tab:complete:kill:*' fzf-preview 'ps -f -p $word'
zstyle ':fzf-tab:complete:killall:*' fzf-preview 'ps -f -C $word'

# Package managers
zstyle ':fzf-tab:complete:brew-install:*' fzf-preview 'brew info $word'

# ----------------------------------------
# Completion Styling
# ----------------------------------------

# Enable colorized file listings
source $DOTFILES/zsh/extras/ls_colors.sh
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}

# Completion sorting preferences
zstyle ':completion:*:git-checkout:*' sort false  # Keep branch order
zstyle ':completion:*' file-sort modification     # Sort files by modification time

# ----------------------------------------
# FZF-Tab Appearance
# ----------------------------------------

# Use tmux popup if available, otherwise regular fzf
if command -v tmux > /dev/null 2>&1; then
    zstyle ':fzf-tab:*' fzf-command ftb-tmux-popup
fi

# Configure fzf-tab appearance with better spacing
zstyle ':fzf-tab:*' fzf-flags --height=50% --layout=reverse --border=rounded --preview-window=right:50%:wrap

# Switch group with `<` and `>`
zstyle ':fzf-tab:*' switch-group '<' '>'

# ----------------------------------------
# Performance Optimizations
# ----------------------------------------

# Cache completions for better performance
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path "$HOME/.cache/zsh-completions"

# Speed up path completion
zstyle ':completion:*' accept-exact '*(N)'
zstyle ':completion:*' squeeze-slashes true
