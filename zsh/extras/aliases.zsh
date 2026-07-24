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
# `cc` runs claude as usual; `cc --<profile>` runs it with
# CLAUDE_CONFIG_DIR=~/.claude-<profile> (e.g. `cc --snowdrop`).
# Only treated as a profile if that directory exists, so real
# claude flags like --resume still pass through.
cc() {
    if [[ "$1" == --* ]] && [[ -d "$HOME/.claude-${1#--}" ]]; then
        local profile="${1#--}"
        shift
        CLAUDE_CONFIG_DIR="$HOME/.claude-$profile" claude "$@"
    else
        claude "$@"
    fi
}

# ---------
# Homebrew maintenance
# ---------
alias brewu="echo 'Updating Homebrew...' &&\
    brew update &&\
    echo 'Upgrading Homebrew formulae...' &&\
    brew upgrade &&\
    echo 'Cleaning up Homebrew...' &&\
    brew cleanup && brew doctor"
