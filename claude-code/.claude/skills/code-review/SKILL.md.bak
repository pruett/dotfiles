---
name: code-review
description: >
  Review all changes on the current branch and write a severity-ranked
  CODE-REVIEW.md. Use when you want an automated code review of branch
  changes, or trigger with "/code-review".
---

# Code Review

Review all changes on the current branch compared to the base branch. Delegate
the actual review to the `code-reviewer` agent, then compile findings into a
severity-ranked `CODE-REVIEW.md`.

## Process

### 1. Orient

Determine the working context:

```bash
git rev-parse --show-toplevel          # repo/worktree root
git branch --show-current              # current branch
git worktree list                      # detect if in a worktree
```

Store the root path from `--show-toplevel` — this is where `CODE-REVIEW.md`
will be written. In a worktree this resolves to the worktree root, not the
main repo root.

Identify the **base branch** (what to diff against):
- If `origin/main` exists → use `origin/main`
- Else if `origin/master` exists → use `origin/master`
- Else use the first remote HEAD

### 2. Compute diff scope

```bash
git diff <base>...HEAD --name-only     # changed files list
git diff <base>...HEAD --stat          # summary stats
```

The three-dot syntax (`...`) diffs against the merge-base, showing only what
this branch changed — not what changed on the base branch since divergence.

If there are **no changed files**, inform the user and stop.

For small diffs (<3000 lines total), capture the full diff:

```bash
git diff <base>...HEAD
```

For large diffs, capture only the file list and stat summary — the agent will
read files directly.

### 3. Read context

If `progress.txt` exists at the root, read it to understand the intent of the
work. Pass this context to the reviewer so findings can be weighed against the
feature's goals.

### 4. Launch code-reviewer agent

Use the Task tool with `subagent_type: "code-reviewer"` to launch the review.

Build the agent prompt from these parts:

1. **Scope**: The current branch name, base branch, and progress.txt summary
   (if available).
2. **Changed files**: The `--name-only` file list.
3. **Diff or file-read instruction**: For small diffs, include the full diff.
   For large diffs (>3000 lines), instruct the agent: "Use your Read and Grep
   tools to examine the changed files directly. Focus on the files listed."
4. **Instructions**: Review all changed files following your standard review
   methodology. For each finding report: severity, file path, line numbers,
   description, and a recommended fix. Use the standard severity levels:
   - **Bug**: Will cause incorrect behavior, crash, or data corruption.
   - **Likely Bug**: Strong evidence of a problem but needs more context to
     verify.
   - **Issue**: Structural or convention problem that won't cause incorrect
     behavior.
   - **Nit**: Minor suggestion, take it or leave it.

### 5. Write CODE-REVIEW.md

After the agent returns, compile its findings into `CODE-REVIEW.md` at the
root path determined in step 1.

```markdown
# Code Review: {branch-name}

> Base: `{base-branch}` | Files changed: {count} | Reviewed: {date}

## Summary

{1-3 sentence overview of the review findings}

---

## Bug

| # | File | Lines | Description | Fix |
|---|------|-------|-------------|-----|

## Likely Bug

| # | File | Lines | Description | Fix |
|---|------|-------|-------------|-----|

## Issue

| # | File | Lines | Description | Fix |
|---|------|-------|-------------|-----|

## Nit

| # | File | Lines | Description | Fix |
|---|------|-------|-------------|-----|
```

#### Formatting rules

- **Severity order is strict**: Bug → Likely Bug → Issue → Nit. Most serious
  findings appear first in the document.
- **Omit empty severity sections** entirely — do not render empty tables.
- **Sort within each section** by file path, then line number.
- **"Fix" column** must contain a concrete, actionable one-liner — not "fix
  this" but "add null check before accessing `user.email`".
- **Numbering** is sequential across the entire document (not per-section).

### 6. Print summary

```
Review complete → CODE-REVIEW.md
  Bug: {n}  |  Likely Bug: {n}  |  Issue: {n}  |  Nit: {n}
```

If there are any Bug or Likely Bug findings, recommend addressing those before
merging.
