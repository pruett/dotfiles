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
# Bare `dot` cds into the repo and opens it; `dot <command>` runs ~/.local/bin/dot.
dot() {
  if (( $# )); then
    command dot "$@"
  else
    cd "$DOTFILES" && $EDITOR .
  fi
}
alias c="clear"
alias reload="source ~/.zshrc"
alias edit="$EDITOR"

# ---------
# Claude Code
# ---------
# `cc` runs claude as usual; `ccw` runs it against the work config
# profile (its own MCP servers, auth, and settings).
alias cc="claude"
alias ccw="CLAUDE_CONFIG_DIR=$HOME/.claude-work claude"

# ---------
# Homebrew maintenance
# ---------
alias brewu="echo 'Updating Homebrew...' &&\
    brew update &&\
    echo 'Upgrading Homebrew formulae...' &&\
    brew upgrade &&\
    echo 'Cleaning up Homebrew...' &&\
    brew cleanup && brew doctor"
