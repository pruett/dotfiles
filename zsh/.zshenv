# Should only contain the user's environment variables.
#
# Note: [this file] `.zshenv` needs to be in your home directory
# - https://thevaluable.dev/zsh-install-configure-mouseless/
#
# Do not touch PATH here. On macOS, /etc/zprofile runs path_helper after
# .zshenv and shuffles system dirs ahead of anything set in this file.
# All PATH management lives in zsh/extras/path.zsh (sourced from .zshrc).

# System
export DOTFILES="$HOME/.dotfiles"

# XDG
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_STATE_HOME="$HOME/.local/state"

# Editor
export EDITOR="zed"
export VISUAL="$EDITOR"
