# ========================================
# ZSH Configuration
# ========================================
# Modular ZSH configuration managed by GNU Stow
#
# Load order:
#   1. Dependency check (validates required tools)
#   2. PATH management (custom binary paths)
#   3. Homebrew environment
#   4. FZF integration (fuzzy finder)
#   5. zsh-vi-mode plugin (defers FZF & fzf-tab keybindings via zvm_after_init)
#   6. Aliases
#   7. Custom functions (via fpath autoload)
#   8. Syntax highlighting
#   9. Autosuggestions
#   10. Tab completions (zstyles only - fzf-tab loaded in zvm_after_init)
#   11. Zoxide (smart cd)
#   12. Local config (optional, gitignored)
#   13. Starship prompt
#
# ========================================

# --------
# Dependency Check
# --------
source $DOTFILES/zsh/extras/depcheck.zsh

# --------
# PATH Management
# --------
source $DOTFILES/zsh/extras/path.zsh

# --------
# Homebrew
# --------
eval $(/opt/homebrew/bin/brew shellenv)

# --------
# FZF Integration
# --------
source $DOTFILES/zsh/extras/fzf.zsh

# --------
# zsh-vi-mode (load before Starship to avoid conflicts)
# --------
# Define what to run after zsh-vi-mode initializes to prevent keybinding conflicts
function zvm_after_init() {
  # Re-initialize FZF keybindings after vi-mode is done
  eval "$(fzf --zsh)"

  # Enable fzf-tab after vi-mode to prevent Tab key conflicts
  if [[ -f $DOTFILES/zsh/plugins/fzf-tab/fzf-tab.plugin.zsh ]]; then
    source $DOTFILES/zsh/plugins/fzf-tab/fzf-tab.plugin.zsh
  fi
}

source "$(brew --prefix zsh-vi-mode)/share/zsh-vi-mode/zsh-vi-mode.plugin.zsh"

# ---------
# Aliases
# ---------
source $DOTFILES/zsh/extras/aliases.zsh

# ---------
# Functions (using fpath autoload)
# ---------
fpath=($DOTFILES/zsh/functions $fpath)
autoload -Uz worktree tmuxn dayta help fzf-file fzf-cd fzf-git-branch fzf-env

# --------
# Syntax Highlighting
# --------
source "$(brew --prefix zsh-syntax-highlighting)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

# --------
# Autosuggestions
# --------
source "$(brew --prefix zsh-autosuggestions)/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
bindkey '^f' autosuggest-accept

# --------
# Tab Completions
# --------
source $DOTFILES/zsh/extras/tabcomp.zsh

# --------
# Zoxide
# --------
eval "$(zoxide init --cmd cd zsh)"

# --------
# Local Config (optionally load gitignored config)
# --------
if [[ -f $DOTFILES/zsh/extras/.zshrc.local.zsh ]]; then
    source $DOTFILES/zsh/extras/.zshrc.local.zsh
fi

# --------
# Starship Prompt
# --------
eval "$(starship init zsh)"
