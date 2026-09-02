# ========================================
# ZSH Configuration
# ========================================
# Modular ZSH configuration managed by GNU Stow
#
# Load order:
#   1. PATH management (custom binary paths)
#   2. Dependency check (validates required tools)
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
# PATH Management (must come before depcheck)
# --------
source $DOTFILES/zsh/extras/path.zsh

# --------
# Dependency Check
# --------
source $DOTFILES/zsh/extras/depcheck.zsh

# --------
# Homebrew
# --------
eval $(/opt/homebrew/bin/brew shellenv)

# brew shellenv only adds site-functions, not the core functions dir containing
# is-at-least, add-zsh-hook, compinit, bashcompinit, etc. Add it explicitly so
# plugins loaded below can find these. typeset -U prevents duplicates on reload.
fpath=(/opt/homebrew/share/zsh/functions $fpath)
typeset -U fpath

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

# Initialize immediately at source time instead of at first precmd, so
# Starship (loaded last) wraps zvm's ZLE widgets exactly once. The default
# deferred init runs after Starship and the mutual wrapping of
# zle-keymap-select recurses until FUNCNEST is exceeded.
ZVM_INIT_MODE=sourcing

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
# Mise (runtime version manager: ruby, etc.)
# --------
eval "$(mise activate zsh)"

# --------
# Zoxide
# --------
# Prevent zoxide from being loaded when CLAUDECODE is set to 1
if [[ "$CLAUDECODE" != "1" ]]; then
    eval "$(zoxide init --cmd cd zsh)"
fi

# --------
# gcloud
# --------
# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/kevinpruett/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/kevinpruett/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/kevinpruett/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/kevinpruett/google-cloud-sdk/completion.zsh.inc'; fi

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
