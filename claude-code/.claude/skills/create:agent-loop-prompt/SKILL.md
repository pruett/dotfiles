---
name: create:agent-loop-prompt
description: >
  Generate a agent-loop-prompt.md file at the project root that defines an agent loop —
  the repeatable task cycle an autonomous agent follows: study the plan, pick
  the next task, implement, validate, update progress, and commit. Also known
  as "Ralph" — trigger when the user says "Ralph", "the Ralph process",
  "set up Ralph", "create an agent loop", "generate a agent-loop-prompt.md", "set up the
  agent loop", or "/create:agent-loop-prompt".
---

# Create Agent Loop Prompt

Generate a `agent-loop-prompt.md` file at the project root that drives an agent loop
through an implementation plan one task at a time. The generated `agent-loop-prompt.md`
is consumed by `agent-loop.sh`, which feeds it to Claude Code on each
iteration.

## Process

### 1. Collect the plan path

Ask the user for the path to the implementation plan (e.g. `plans/feature.md`).
Validate the file exists before continuing. If it does not exist, inform the
user and ask again.

### 2. Check for existing agent-loop-prompt.md

If `agent-loop-prompt.md` already exists at the project root, warn the user and ask
whether to overwrite it.

### 3. Initialize progress.txt

Create an empty `progress.txt` at the project root if one does not already
exist.

### 4. Write agent-loop-prompt.md

Write the following to `agent-loop-prompt.md` at the project root, replacing
`<plan-path>` with the user-provided path:

```markdown
0. Study the `src/` directory to understand the codebase.
1. Study @<plan-path>
2. Review @progress.txt
3. Find the highest-priority incomplete task and implement it.
4. Run type checks, tests, linting, and formatting (if applicable). Do NOT commit if any fail. Fix issues first.
5. Update the plan — mark the task complete.
6. Append your progress to progress.txt:
   - Concise summary of what was implemented
   - Files changed
   - (Optional) learnings, patterns, gotchas
7. Commit your changes.

ONLY WORK ON A SINGLE TASK.

If, while implementing, you notice that all work is complete, output <promise>COMPLETE</promise>
```
