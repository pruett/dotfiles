#!/bin/bash

# Context usage thresholds
ORANGE_THRESHOLD=35
RED_THRESHOLD=50

# Branch/worktree names longer than this get shortened to first 4 + last 4
MAX_NAME_LENGTH=16

# Shorten the final path segment of a name, leaving any leading segments intact
# (so worktree/v2-rearchitecture becomes worktree/v2-r...ture, not work...ture)
truncate_name() {
    local name="$1"
    local prefix="" leaf="$name"

    if [[ "$name" == */* ]]; then
        prefix="${name%/*}/"
        leaf="${name##*/}"
    fi

    if [ ${#leaf} -gt "$MAX_NAME_LENGTH" ]; then
        leaf="${leaf:0:4}...${leaf: -4}"
    fi

    printf '%s%s' "$prefix" "$leaf"
}

# Read JSON input from stdin
input=$(cat)

# Extract values using jq
model=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // "."')

# Get git information
git_info=""
if [ -d "$cwd/.git" ] || git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    # Get current branch name
    branch=$(git -C "$cwd" --no-optional-locks branch --show-current 2>/dev/null)

    if [ -n "$branch" ]; then
        branch_display=$(truncate_name "$branch")
        git_info="🌿 $branch_display"

        # Check if we're in a git worktree
        git_dir=$(git -C "$cwd" --no-optional-locks rev-parse --git-dir 2>/dev/null)
        if [ -n "$git_dir" ] && [[ "$git_dir" == *"/worktrees/"* ]]; then
            worktree_root=$(git -C "$cwd" --no-optional-locks rev-parse --show-toplevel 2>/dev/null)
            if [ -n "$worktree_root" ]; then
                parent=$(basename "$(dirname "$worktree_root")")
                name=$(basename "$worktree_root")
                worktree_display="$parent/$name"
            else
                worktree_display="$cwd"
            fi
            git_info="🌿 $branch_display 🌳 $(truncate_name "$worktree_display")"
        fi
    fi
fi

# Calculate context usage percentage
usage=$(echo "$input" | jq '.context_window.current_usage')
if [ "$usage" != "null" ] && [ -n "$usage" ]; then
    input_tokens=$(echo "$usage" | jq '.input_tokens // 0')
    cache_creation=$(echo "$usage" | jq '.cache_creation_input_tokens // 0')
    cache_read=$(echo "$usage" | jq '.cache_read_input_tokens // 0')
    window_size=$(echo "$input" | jq '.context_window.context_window_size // 1')

    current_tokens=$((input_tokens + cache_creation + cache_read))
    if [ "$window_size" -gt 0 ]; then
        percentage=$((current_tokens * 100 / window_size))
    else
        percentage=0
    fi

    if [ "$percentage" -gt "$RED_THRESHOLD" ]; then
        usage_display="🔴 ${percentage}%"
    elif [ "$percentage" -gt "$ORANGE_THRESHOLD" ]; then
        usage_display="🟠 ${percentage}%"
    else
        usage_display="🟢 ${percentage}%"
    fi
else
    usage_display="0%"
fi

# Output the formatted status line
if [ -n "$git_info" ]; then
    printf "%s | 🤖 %s | %s" "$git_info" "$model" "$usage_display"
else
    printf "🤖 %s | %s" "$model" "$usage_display"
fi
