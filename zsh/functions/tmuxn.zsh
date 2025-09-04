tmuxn() {
    local session_name=$(basename $(pwd))

    # Check if session already exists
    if tmux has-session -t "$session_name" 2>/dev/null; then
        echo "Warning: A tmux session named '$session_name' already exists."
        echo -n "Would you like to attach to the existing session? (y/n): "
        read response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            tmux attach-session -t "$session_name"
        else
            echo "Cancelled. No action taken."
        fi
    else
        tmux new-session -s "$session_name"
    fi
}
