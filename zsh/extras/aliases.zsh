alias ls="eza --icons=auto"
alias vim="nvim"
alias pn="pnpm"
alias dot="cd $DOTFILES && $EDITOR ."
alias c="clear"
alias reload="source ~/.zshrc"
alias brewu="echo 'Updating Homebrew...' &&\
    brew update &&\
    echo 'Upgrading Homebrew formulae...' &&\
    brew upgrade &&\
    echo 'Cleaning up Homebrew...' &&\
    brew cleanup && brew doctor"
alias edit="$EDITOR"
