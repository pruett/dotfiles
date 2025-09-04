# --------
# Dependency Check
# --------
source $DOTFILES/zsh/extras/depcheck.zsh

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
source "$(brew --prefix zsh-vi-mode)/share/zsh-vi-mode/zsh-vi-mode.plugin.zsh"

# ---------
# Aliases
# ---------
source $DOTFILES/zsh/extras/aliases.zsh

# ---------
# Functions
# ---------
source $DOTFILES/zsh/functions/worktree.zsh
source $DOTFILES/zsh/functions/tmuxn.zsh

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
