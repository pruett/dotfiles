# --------
# Prompt
# --------
# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.config/zsh/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

source /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme

# To customize prompt, run `p10k configure` or edit ~/.dotfiles/zsh/prompt/.p10k.zsh.
[[ ! -f ~/.dotfiles/zsh/prompt/.p10k.zsh ]] || source ~/.dotfiles/zsh/prompt/.p10k.zsh

# --------
# Config
# --------

# sytax highlighting
source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# autosuggestions
source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
bindkey '^f' autosuggest-accept

# tab completions
if type brew &>/dev/null; then
  FPATH=/opt/homebrew/share/zsh-completions:$FPATH

  autoload -Uz compinit
  compinit
fi

# force zsh not to show completion menu, which allows fzf-tab to capture the unambiguous prefix
zstyle ":completion:*" menu no
# case insensitive completion
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
# disable sort when completing `git checkout`
zstyle ':completion:*:git-checkout:*' sort false
# NOTE: don't use escape sequences (like '%F{red}%d%f') here, fzf-tab will ignore them
zstyle ':completion:*:descriptions' format '[%d]'
# enable filename colorizing
source ~/.dotfiles/zsh/extras/ls_colors.sh
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}

# ---------
# Aliases
# ---------
alias ls="eza --icons=auto"
alias nvim="nvim"
alias c="clear"
alias reload="source ~/.zshrc"
alias brewu="echo 'Updating Homebrew...' &&\
    brew update &&\
    echo 'Upgrading Homebrew formulae...' &&\
    brew upgrade &&\
    echo 'Cleaning up Homebrew...' &&\
    brew cleanup && brew doctor"

# --------
# History
# --------
HISTSIZE=10000
HISTFILE="$HOME/.zsh_history"
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

# keybindings
# bindkey -e
bindkey "^p" history-search-backward
bindkey "^n" history-search-forward

# --------
# Path
# --------
# Homebrew
eval $(/opt/homebrew/bin/brew shellenv)
# PNPM
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PATH:$PNPM_HOME"

# ---------
# Shell integrations
# ---------
# fzf
eval "$(fzf --zsh)"

source ~/.dotfiles/zsh/plugins/fzf-tab/fzf-tab.plugin.zsh

# preview directory's content with eza when completing cd
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -1 --color=always $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'eza -1 --color=always $realpath'
# tmux popup
zstyle ':fzf-tab:*' fzf-command ftb-tmux-popup

# Zoxide
eval "$(zoxide init --cmd cd zsh)"
