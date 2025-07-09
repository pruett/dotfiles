worktree() {
    if [ -z "$1" ]; then
        echo "Usage: worktree <branch-name>"
        return 1
    fi

    # Get the current directory name
    local current_dir=$(basename "$PWD")

    # Create the worktree directory name
    local worktree_name="${current_dir}-worktree-${1}"

    # Create the worktree path (sibling to current directory)
    local worktree_path="../${worktree_name}"

    # Create the git worktree with new branch
    git worktree add -b "$1" "$worktree_path"

    # Change to the new worktree directory if creation was successful
    if [ $? -eq 0 ]; then
        cd "$worktree_path"
        echo "Created worktree '$worktree_name' with branch '$1' and switched to it"
    else
        echo "Failed to create worktree"
        return 1
    fi
}
