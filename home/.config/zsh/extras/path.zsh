# ========================================
# PATH Management
# ========================================
# The single place PATH is assembled. Sourced first from .zshrc.
#
# Resulting order (first wins):
#   1. ~/.local/bin         user scripts (dotfiles home/.local/bin)
#   2. language toolchains  cargo, go, bun
#   3. Homebrew             /opt/homebrew/{bin,sbin}
#   4. system               whatever login handed us
#
# Tools that manage their own PATH (mise activate, gcloud) run later in
# .zshrc and prepend on top of this when active.

# Homebrew goes in first so the user dirs below land ahead of it.
eval "$(/opt/homebrew/bin/brew shellenv)"

# Unique entries; first occurrence wins.
typeset -U path

path=(
    $HOME/.local/bin
    $HOME/.cargo/bin
    $HOME/go/bin
    $HOME/.config/cache/.bun/bin
    $HOME/google-cloud-sdk/bin
    $path
)

# Drop entries that don't exist on this machine.
path=($^path(N-/))

export PATH
