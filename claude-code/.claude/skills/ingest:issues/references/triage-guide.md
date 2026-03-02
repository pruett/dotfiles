# Triage Guide

Rules for parsing raw notes into discrete tasks, classifying complexity, and
grouping related items.

## Parsing Heuristics

### Identifying Units of Work

Scan the input for signals that indicate a distinct task:

- **Explicit items**: Bullets, numbered lists, headings, checkboxes
- **Implicit items**: A sentence that describes a problem AND a separate sentence
  describing a different problem, even in the same paragraph
- **Compound items**: "Fix X and also update Y" — if X and Y touch different
  files or concerns, split them

### When to Split

Split an item into multiple tasks when:

- It touches unrelated files or modules
- It mixes frontend and backend work
- It combines a bug fix with a feature enhancement
- Different people could reasonably work on the sub-parts independently
- The sub-parts could ship independently

### When to Merge

Merge multiple items into one task when:

- They describe the same problem from different angles
- They are sequential steps of one logical change (e.g., "add field to DB" and
  "show field in UI" for a trivial addition)
- Splitting would create tasks too small to stand alone (< 5 minutes of work)
- They share all the same affected files and context

### When to Group (but keep separate)

Place tasks in the same PRD section when they share a domain or concern, but keep
them as individual tasks when they can be implemented and verified independently.

## Classification Rubric

### Simple

**Signals:**
- "Fix typo", "rename", "update copy", "change color", "swap icon"
- Single file, obvious location
- No behavioral change or logic involved
- No tests need updating (or only a trivial assertion change)

**Spec includes:** Title, 1-2 sentence description, file path, done-when criteria.

**Example:**
> Title: Fix typo in dashboard header
> File: `src/components/Dashboard.tsx:14`
> Done when: "Dashbaord" reads "Dashboard"

### Medium

**Signals:**
- Bug fix requiring investigation
- New UI component with defined behavior
- API endpoint modification
- 2-5 files affected
- Requires understanding existing patterns but no new architecture

**Spec includes:** Title, description with context, affected files, requirements
(bulleted), acceptance criteria.

### Complex

**Signals:**
- "Add authentication", "refactor the X system", "integrate with Y"
- Crosses multiple modules or layers (frontend + backend + database)
- Requires design decisions or trade-offs
- Affects shared interfaces or data models
- 5+ files affected, or new subsystem

**Spec includes:** Title, description with context and motivation, affected
areas, detailed requirements, interfaces/contracts if applicable, edge cases,
acceptance criteria with Given/When/Then, open questions if any.

## Priority Signals

When ordering tasks within a section, use these signals (strongest first):

1. **Blocks other tasks** — must be done first
2. **User-facing breakage** — bugs visible to end users
3. **Data integrity** — anything that could corrupt or lose data
4. **Security** — vulnerabilities or access control issues
5. **Feature requests** — new functionality
6. **Tech debt / refactors** — internal improvements
7. **Nice-to-haves** — cosmetic, minor polish

## Categories

Use these as section headers in the PRD when grouping by domain:

- **Bugs & Fixes** — Broken behavior that needs correcting
- **UI/UX** — Visual, layout, interaction, and accessibility changes
- **Features** — New functionality or capabilities
- **API & Backend** — Server-side logic, endpoints, data handling
- **Infrastructure & Config** — Build, deploy, CI/CD, environment
- **Refactors & Tech Debt** — Internal improvements without user-facing change
- **Documentation** — Docs, comments, READMEs

Not all categories will appear in every PRD. Only use categories that have tasks.
