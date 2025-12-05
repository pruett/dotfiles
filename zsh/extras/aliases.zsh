# ========================================
# Shell Aliases
# ========================================

# ---------
# Modern tool replacements
# ---------
alias ls="eza --icons=auto"
alias vim="nvim"
alias pn="pnpm"

# ---------
# Navigation shortcuts
# ---------
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'
alias md='mkdir -p'
alias rd='rmdir'

# ---------
# Convenience shortcuts
# ---------
alias dot="cd $DOTFILES && $EDITOR ."
alias c="clear"
alias reload="source ~/.zshrc"
alias edit="$EDITOR"

# ---------
# Claude Code
# ---------
alias cc="claude"
alias 'cc!'="claude --dangerously-skip-permissions"

# ---------
# Homebrew maintenance
# ---------
alias brewu="echo 'Updating Homebrew...' &&\
    brew update &&\
    echo 'Upgrading Homebrew formulae...' &&\
    brew upgrade &&\
    echo 'Cleaning up Homebrew...' &&\
    brew cleanup && brew doctor"
