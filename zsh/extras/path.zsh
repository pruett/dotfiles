# ========================================
# PATH Management
# ========================================
# Centralized PATH configuration for all custom binaries and tools
# Uses typeset -U to ensure unique entries (no duplicates)

typeset -U path

# Add custom paths (prepend to take precedence)
path=(
    $HOME/.local/bin
    $HOME/bin
    $path
)

export PATH
