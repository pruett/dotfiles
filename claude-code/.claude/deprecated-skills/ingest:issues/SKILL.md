---
name: ingest:issues
description: >
  Triage a raw, ad-hoc markdown file of mixed issues, bugs, fixes, and feature
  requests into discrete, well-specified tasks written to a PRD.md file. Use when
  the user has a hastily written notes file containing scattered work items across
  multiple topics (UI fixes, backend changes, new features, bugs, etc.) and wants
  them organized into standalone, implementable task specs. Triggers on
  "/ingest:issues" or when the user asks to "triage issues", "turn notes into
  tasks", "organize my backlog", or "create a PRD from my notes".
---

# Ingest Issues

Parse a raw markdown file of scattered issues, bugs, and feature requests into
discrete, well-specified tasks. Output a PRD.md with each task as a standalone
unit of work — from one-line fixes to multi-step features.

## Input

A path to a markdown file provided as an argument. If no path is given, prompt
the user for one before proceeding. Do not guess or assume a default location.

## Process

### 1. Read and Parse

Read the input file completely. Identify every distinct unit of work mentioned —
explicit or implied. Items may be:

- Bugs or broken behavior
- UI/UX fixes or tweaks
- Feature requests or enhancements
- Refactors or tech debt
- Configuration or infrastructure changes
- Documentation updates

A single bullet or paragraph may contain multiple units of work. A cluster of
related bullets may be one unit. Use judgment. Read `references/triage-guide.md`
for classification rules and grouping heuristics.

### 2. Explore the Codebase

For each identified item, explore the codebase to fill in context:

- Locate the relevant files, components, functions, or modules
- Understand the current behavior and architecture
- Identify dependencies, related code, and potential side effects
- Note existing patterns, conventions, and test coverage

This step is critical. The raw notes will be vague — "fix the header bug" tells
you nothing without knowing which header, what bug, and what file. Do the
detective work.

### 3. Ask Focused Questions

After the exploration pass, compile a single focused round of questions for items
where:

- The intent is genuinely ambiguous (multiple valid interpretations)
- The scope is unclear (could be a 5-minute fix or a multi-day rewrite)
- A design decision is needed that the codebase doesn't answer
- The item contradicts another item or existing behavior

Batch questions efficiently (group by topic). Do NOT ask about things you already
resolved via codebase exploration. Do NOT ask about simple, obvious items.

If everything is clear after exploration, skip this step entirely and proceed.

### 4. Classify and Size

For each task, assign a complexity tier. Read `references/triage-guide.md` for
the full classification rubric. In short:

- **Simple** — Single-file change, obvious fix, no design decisions. Gets a
  minimal spec (title, description, file reference, done-criteria).
- **Medium** — Multi-file change, some decisions, clear scope. Gets a standard
  spec with requirements, affected files, and acceptance criteria.
- **Complex** — Cross-cutting concern, design decisions needed, multiple
  components. Gets a full spec with context, requirements, interfaces, edge
  cases, and acceptance criteria.

Match the spec detail to the task complexity. A typo fix does not need acceptance
criteria with Given/When/Then. A new API endpoint does.

### 5. Write PRD.md

Read `references/prd-template.md` for the output format. Write the PRD to
`PRD.md` in the project root (or a user-specified path).

Group tasks into logical sections by domain or concern. Order tasks within each
section by priority (most impactful or blocking first). Every task must be
standalone — a developer should be able to pick up any single task and implement
it without reading the rest of the PRD.

### 6. Present Summary

After writing the file, present a brief summary:

- Total number of tasks extracted
- Breakdown by complexity tier
- Any items that were intentionally dropped or deferred (with reasons)
- Any open questions or assumptions made

## Rules

- Never invent work that isn't in the source file (even implicitly)
- Never combine unrelated items into one task for convenience
- Never pad simple tasks with unnecessary ceremony
- Always reference specific files/functions discovered during exploration
- If two items are clearly the same issue stated differently, merge them and note it
- If an item is too vague to act on even after exploration and questions, flag it
  as "Needs Clarification" in the PRD rather than guessing
- Preserve the user's original language/intent — don't editorialize

## Resources

### references/
- `triage-guide.md` — Classification rubric, grouping heuristics, and complexity
  tier definitions. Read during the Parse and Classify steps.
- `prd-template.md` — Output format for PRD.md. Read before writing the output.
