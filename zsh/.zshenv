# Should only contains user's environment variables
#
# Note: [this file] `.zshenv` needs to be in your home directory
# - https://thevaluable.dev/zsh-install-configure-mouseless/

# System
export DOTFILES="$HOME/.dotfiles"

# XDG
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"

# Local bin
export PATH="$HOME/.local/bin:$PATH"

# Editor
export EDITOR="zed"
export VISUAL="$EDITOR"
