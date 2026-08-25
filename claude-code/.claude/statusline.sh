#!/bin/bash

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
        git_info="🌿 $branch"

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
            git_info="🌿 $branch 🌳 $worktree_display"
        fi
    fi
fi

session_id_full=$(echo "$input" | jq -r '.session_id // "N/A"')

# Truncate session ID to show first 4 and last 4 characters with ... in between
if [ "$session_id_full" != "N/A" ] && [ ${#session_id_full} -gt 11 ]; then
    session_id="${session_id_full:0:4}...${session_id_full: -4}"
else
    session_id="$session_id_full"
fi

# Determine sandbox status from settings files
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // "."')
sandbox_enabled="false"
# Check project-level settings first, then global
for settings_file in "$project_dir/.claude/settings.json" "$HOME/.claude/settings.json"; do
    if [ -f "$settings_file" ]; then
        val=$(jq -r '.sandbox.enabled // empty' "$settings_file" 2>/dev/null)
        if [ -n "$val" ]; then
            sandbox_enabled="$val"
            break
        fi
    fi
done

if [ "$sandbox_enabled" = "true" ]; then
    sandbox_display="🔒 sandbox"
else
    sandbox_display="🔓 no sandbox"
fi

# Calculate total context tokens and percentage of the model's context window
usage=$(echo "$input" | jq '.context_window.current_usage')
if [ "$usage" != "null" ] && [ -n "$usage" ]; then
    input_tokens=$(echo "$usage" | jq '.input_tokens // 0')
    cache_creation=$(echo "$usage" | jq '.cache_creation_input_tokens // 0')
    cache_read=$(echo "$usage" | jq '.cache_read_input_tokens // 0')
    current_tokens=$((input_tokens + cache_creation + cache_read))
    window_size=$(echo "$input" | jq '.context_window.context_window_size // 1000000')
    if [ "$window_size" -le 0 ]; then
        window_size=1000000
    fi
    percentage=$((current_tokens * 100 / window_size))
    usage_display="${current_tokens} tokens (${percentage}%)"
else
    usage_display="0 tokens (0%)"
fi

# Output the formatted status line
if [ -n "$git_info" ]; then
    printf "%s | 🤖 %s | 🔑 %s | %s | %s" "$git_info" "$model" "$session_id" "$sandbox_display" "$usage_display"
else
    printf "🤖 %s | 🔑 %s | %s | %s" "$model" "$session_id" "$sandbox_display" "$usage_display"
fi
