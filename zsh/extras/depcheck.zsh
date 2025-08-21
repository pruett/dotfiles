# ========================================
# ZSH Environment Dependency Checker
# ========================================
# Centralized dependency checking for our ZSH configuration
# All tools listed here are considered essential for the environment

# ----------------------------------------
# Configuration
# ----------------------------------------

# Set to true to exit on missing dependencies (strict mode)
DEPCHECK_STRICT_MODE=${DEPCHECK_STRICT_MODE:-false}

# Color codes for output
DEPCHECK_RED='\033[0;31m'
DEPCHECK_YELLOW='\033[1;33m'
DEPCHECK_GREEN='\033[0;32m'
DEPCHECK_BLUE='\033[0;34m'
DEPCHECK_NC='\033[0m' # No Color

# ----------------------------------------
# Dependency Lists
# ----------------------------------------

# Core shell enhancement tools
DEPCHECK_CORE_DEPS=(
    "fzf:Command-line fuzzy finder"
    "fd:Fast alternative to find"
    "bat:Syntax-highlighted file viewer"
    "eza:Modern replacement for ls"
    "zoxide:Smart directory navigation"
    "starship:Cross-shell prompt"
)

# Development tools
DEPCHECK_DEV_DEPS=(
    "git:Version control system"
    "nvim:Modern Vim-based editor"
    "rg:Fast text search (ripgrep)"
)

# Optional but recommended tools
DEPCHECK_OPTIONAL_DEPS=(
    "gh:GitHub CLI"
    "jq:JSON processor"
    "tldr:Simplified man pages"
    "delta:Better git diff viewer"
)

# ----------------------------------------
# Helper Functions
# ----------------------------------------

# Check if a command exists
_depcheck_command_exists() {
    command -v "$1" > /dev/null 2>&1
}

# Print colored output
_depcheck_print() {
    local color="$1"
    local message="$2"
    printf "${color}%s${DEPCHECK_NC}\n" "$message"
}

# Parse dependency string (format: "command:description")
_depcheck_parse_dep() {
    local dep="$1"
    echo "${dep%%:*}" # Extract command name (before colon)
}

_depcheck_parse_desc() {
    local dep="$1"
    echo "${dep##*:}" # Extract description (after colon)
}

# ----------------------------------------
# Dependency Checking Logic
# ----------------------------------------

_depcheck_missing_deps=()
_depcheck_optional_missing=()

# Check core dependencies
for dep in "${DEPCHECK_CORE_DEPS[@]}"; do
    cmd=$(_depcheck_parse_dep "$dep")
    desc=$(_depcheck_parse_desc "$dep")
    
    if ! _depcheck_command_exists "$cmd"; then
        _depcheck_missing_deps+=("$cmd")
        _depcheck_print "$DEPCHECK_RED" "⚠️  Missing: $cmd ($desc)"
    fi
done

# Check development dependencies
for dep in "${DEPCHECK_DEV_DEPS[@]}"; do
    cmd=$(_depcheck_parse_dep "$dep")
    desc=$(_depcheck_parse_desc "$dep")
    
    if ! _depcheck_command_exists "$cmd"; then
        _depcheck_missing_deps+=("$cmd")
        _depcheck_print "$DEPCHECK_RED" "⚠️  Missing: $cmd ($desc)"
    fi
done

# Check optional dependencies (warnings only)
for dep in "${DEPCHECK_OPTIONAL_DEPS[@]}"; do
    cmd=$(_depcheck_parse_dep "$dep")
    desc=$(_depcheck_parse_desc "$dep")
    
    if ! _depcheck_command_exists "$cmd"; then
        _depcheck_optional_missing+=("$cmd")
        _depcheck_print "$DEPCHECK_YELLOW" "💡 Optional: $cmd ($desc)"
    fi
done

# ----------------------------------------
# Installation Instructions
# ----------------------------------------

if [[ ${#_depcheck_missing_deps[@]} -gt 0 ]]; then
    _depcheck_print "$DEPCHECK_BLUE" ""
    _depcheck_print "$DEPCHECK_BLUE" "📦 Install missing dependencies:"
    _depcheck_print "$DEPCHECK_BLUE" "   brew install ${_depcheck_missing_deps[*]}"
    
    if [[ "$DEPCHECK_STRICT_MODE" == "true" ]]; then
        _depcheck_print "$DEPCHECK_RED" "❌ Exiting due to missing dependencies (DEPCHECK_STRICT_MODE=true)"
        return 1
    fi
fi

if [[ ${#_depcheck_optional_missing[@]} -gt 0 ]]; then
    _depcheck_print "$DEPCHECK_BLUE" ""
    _depcheck_print "$DEPCHECK_BLUE" "🔧 Install optional tools:"
    _depcheck_print "$DEPCHECK_BLUE" "   brew install ${_depcheck_optional_missing[*]}"
fi

# Success message if everything is installed
if [[ ${#_depcheck_missing_deps[@]} -eq 0 && ${#_depcheck_optional_missing[@]} -eq 0 ]]; then
    _depcheck_print "$DEPCHECK_GREEN" "✅ All dependencies satisfied!"
fi

# ----------------------------------------
# Cleanup
# ----------------------------------------

# Clean up temporary variables and functions
unset _depcheck_missing_deps _depcheck_optional_missing
unset -f _depcheck_command_exists _depcheck_print _depcheck_parse_dep _depcheck_parse_desc

# ----------------------------------------
# Usage Examples
# ----------------------------------------
# 
# To add new dependencies, simply append to the appropriate array:
# 
# DEPCHECK_CORE_DEPS+=(
#     "new-tool:Description of the tool"
# )
#
# To enable strict mode (exit on missing deps):
# export DEPCHECK_STRICT_MODE=true
