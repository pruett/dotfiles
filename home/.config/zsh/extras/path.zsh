# ========================================
# PATH Management
# ========================================
# The single place PATH is assembled. Sourced first from .zshrc.
#
# Resulting order (first wins):
#   1. ~/.local/bin         user scripts (dotfiles home/.local/bin)
#   2. language toolchains  cargo, go, bun
#   3. Homebrew             /opt/homebrew (macOS) or /home/linuxbrew/.linuxbrew (Linux)
#   4. system               whatever login handed us
#
# Tools that manage their own PATH (mise activate, gcloud) run later in
# .zshrc and prepend on top of this when active.

# Homebrew goes in first so the user dirs below land ahead of it.
for brew_bin in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
    [[ -x $brew_bin ]] && eval "$($brew_bin shellenv)" && break
done
unset brew_bin

# exe.dev VMs: their shared env (DEVBOX_WORKSPACE, user bin dirs), which their
# bash setup sources. POSIX sh, safe to source here.
[[ -f $HOME/.config/devbox/env.sh ]] && source "$HOME/.config/devbox/env.sh"

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
