#!/bin/bash

# Read JSON input from stdin
input=$(cat)

# Debug: save input to file
echo "$input" > /tmp/statusline-debug.json

# Extract context usage statistics
used=$(echo "$input" | jq -r '.usage.inputTokens // 0')
total=$(echo "$input" | jq -r '.usage.inputTokensMax // 0')
remaining=$((total - used))

# Calculate percentage
if [ "$total" -gt 0 ]; then
  percentage=$(awk "BEGIN {printf \"%.1f\", ($used/$total)*100}")
else
  percentage="0.0"
fi

# Extract model and directory info
model=$(echo "$input" | jq -r '.model.display_name // "unknown"')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // "~"')
dir_name="${current_dir##*/}"

# Color codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
RESET='\033[0m'

# Determine color based on usage percentage
if (( $(awk "BEGIN {print ($percentage < 50)}") )); then
  usage_color=$GREEN
elif (( $(awk "BEGIN {print ($percentage < 80)}") )); then
  usage_color=$YELLOW
else
  usage_color=$RED
fi

# Format numbers with commas
used_formatted=$(printf "%'d" $used)
total_formatted=$(printf "%'d" $total)
remaining_formatted=$(printf "%'d" $remaining)

# Output status line with context usage
echo -e "${BLUE}${model}${RESET} ${CYAN}📁 ${dir_name}${RESET} ${usage_color}🧠 ${used_formatted}/${total_formatted} (${percentage}%)${RESET} ${GREEN}⚡ ${remaining_formatted} left${RESET}"
