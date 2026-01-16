#!/bin/bash

# Context usage thresholds
ORANGE_THRESHOLD=35
RED_THRESHOLD=50

# Read JSON input from stdin
input=$(cat)

# Extract values using jq
model=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
session_id_full=$(echo "$input" | jq -r '.session_id // "N/A"')
duration_ms=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
lines_added=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
lines_removed=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

# Truncate session ID to show first 4 and last 4 characters with ... in between
if [ "$session_id_full" != "N/A" ] && [ ${#session_id_full} -gt 11 ]; then
    session_id="${session_id_full:0:4}...${session_id_full: -4}"
else
    session_id="$session_id_full"
fi

# Format session duration
if [ "$duration_ms" -gt 0 ]; then
    total_seconds=$((duration_ms / 1000))
    minutes=$((total_seconds / 60))
    seconds=$((total_seconds % 60))

    if [ "$minutes" -gt 0 ]; then
        session_time="${minutes}m ${seconds}s"
    else
        session_time="${seconds}s"
    fi
else
    session_time="0s"
fi

# Format lines changed
if [ "$lines_added" -gt 0 ] || [ "$lines_removed" -gt 0 ]; then
    lines_changed="+${lines_added}/-${lines_removed}"
else
    lines_changed="+0/-0"
fi

# Calculate context usage percentage
usage=$(echo "$input" | jq '.context_window.current_usage')
if [ "$usage" != "null" ] && [ -n "$usage" ]; then
    # Extract token counts from current_usage
    # - input_tokens: Fresh, non-cached input tokens
    # - cache_creation_input_tokens: Input tokens being written to cache
    # - cache_read_input_tokens: Input tokens read from cache (90% cheaper but still use context)
    # Note: output_tokens is NOT included in context usage calculation
    input_tokens=$(echo "$usage" | jq '.input_tokens // 0')
    cache_creation=$(echo "$usage" | jq '.cache_creation_input_tokens // 0')
    cache_read=$(echo "$usage" | jq '.cache_read_input_tokens // 0')
    window_size=$(echo "$input" | jq '.context_window.context_window_size // 1')

    # Calculate current tokens and percentage
    # Formula: input_tokens + cache_creation_input_tokens + cache_read_input_tokens
    current_tokens=$((input_tokens + cache_creation + cache_read))
    if [ "$window_size" -gt 0 ]; then
        percentage=$((current_tokens * 100 / window_size))
    else
        percentage=0
    fi

    # Apply emoji indicator based on thresholds
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
printf "Model: %s | Session: %s | Time: %s | Lines: %s | Context: %s" "$model" "$session_id" "$session_time" "$lines_changed" "$usage_display"
