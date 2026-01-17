# Should only contains user's environment variables
#
# Note: [this file] `.zshenv` needs to be in your home directory
# - https://thevaluable.dev/zsh-install-configure-mouseless/

# System
export DOTFILES="$HOME/.dotfiles"

# XDG
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$XDG_CONFIG_HOME/local/share"
export XDG_CACHE_HOME="$XDG_CONFIG_HOME/cache"

# Editor
export EDITOR="zed"
export VISUAL="$EDITOR"
. "$HOME/.cargo/env"
