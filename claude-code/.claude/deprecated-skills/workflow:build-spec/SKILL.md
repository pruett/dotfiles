---
name: workflow:build-spec
description: >
  Kick off autonomous feature development. Creates a git worktree, generates an
  implementation plan from a spec, configures the agent-loop prompt, and launches
  the agent loop in a new tmux pane. Use when starting work on a new feature.
  Triggers on "/workflow:build-spec".
---

# Feature Kickoff

Orchestrates the full setup for autonomous feature implementation in an isolated
worktree. Takes a feature name, wires up the plan and prompt, and hands off to
the agent loop.

## Input

A feature name matching a spec in `specs/<feature-name>.md`.

Examples: `real-time-transport`, `websocket-server`, `auth-flow`

## Process

### 1. Validate

- Confirm `specs/<feature-name>.md` exists. Abort if not found.
- Confirm `AGENT-LOOP-PROMPT.md` exists at project root. If missing, copy from
  `assets/AGENT-LOOP-PROMPT.md` and commit it so worktrees inherit it.

### 2. Create worktree

Follow git-worktree skill conventions:

```bash
mkdir -p .claude/.worktrees
git worktree add .claude/.worktrees/feat-<name> -b feat/<name>
```

### 3. Enter worktree

```bash
cd .claude/.worktrees/feat-<name>
```

All remaining steps happen inside the worktree.

### 4. Generate implementation plan

```bash
mkdir -p plans
```

Run `/implementation-plan` against `specs/<feature-name>.md`. Tell it to output
the plan to `plans/<feature-name>.md`.

### 5. Update AGENT-LOOP-PROMPT.md

Edit the worktree's inherited copy:

1. Delete the entire `<template-instructions>` block (opening tag through
   closing tag, inclusive)
2. Replace `<link-to-plan>` with `<feature-name>` so the path reads
   `@plans/<feature-name>.md`

### 6. Initialize progress.txt

Create an empty `progress.txt` in the worktree root if one does not already exist. Ensure this file is empty.

### 7. Launch agent loop

Open a new tmux pane with `remain-on-exit` enabled so the pane stays open after
the script finishes:

```bash
tmux split-window -h "tmux set-option remain-on-exit on; cd $(pwd) && caffeinate -ims agent-loop.sh"
```

## Rules

- Always validate the spec exists BEFORE creating the worktree
- The worktree inherits `AGENT-LOOP-PROMPT.md` from main — edit the worktree
  copy, never the original
- Do NOT commit the updated prompt or progress.txt — the agent loop handles its
  own commits
