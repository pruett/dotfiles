---
name: implementation-plan
description: >
  Generate a structured, file-based implementation plan from a spec or PRD.
  Use when the user asks to turn a spec, PRD, or requirements document into
  an ordered set of implementation tasks, or requests an "implementation plan."
  Triggers on "/implementation-plan".
---

# Implementation Plan

Generate a file-based implementation plan from a written spec or PRD. Plans are
chunked into small units of related work, written as bullet points for easy
updating, and ordered using tracer bullet methodology.

## Process

1. **Read the spec** — Read the referenced spec/PRD file completely. If no spec
   file is provided, ask the user for one before proceeding.
2. **Explore the codebase** — Understand the existing architecture, patterns, and
   conventions relevant to the spec. Identify integration points and constraints.
3. **Identify the tracer bullet(s)** — Find the thinnest possible end-to-end
   slice(s) that touch all layers of the system. If the spec spans independent
   subsystems, identify a separate tracer bullet for each. This is Phase 0.
4. **Chunk remaining work** — Group related tasks into small, focused chunks.
   Each chunk should be completable in a single session.
5. **Order by dependency** — Within each phase, order chunks so earlier ones
   unblock later ones.
6. **Write the plan file** — Output to `PLAN.md` in the project root (or path
   specified by the user).

## Tracer Bullet Philosophy

Phase 0 contains one or more **minimal end-to-end slices** (tracer bullets).
Each tracer bullet must:

- Pass through all layers of the system (UI → API → data, or equivalent)
- Produce something observable / testable
- Validate architectural assumptions before investing in breadth
- Be intentionally minimal — hardcoded values, single happy path, no edge cases

**When to use multiple tracer bullets:** If the spec involves distinct subsystems
or independent integration paths (e.g., a REST API *and* a WebSocket feed, or an
ingestion pipeline *and* a query interface), use a separate tracer bullet for each
path. Each one should prove out a different architectural seam. If the feature is
a single flow through one stack, one tracer bullet is sufficient.

After the tracer bullet(s), expand outward: fill in remaining happy paths, then
edge cases, then polish.

## Plan Format

Use this structure exactly:

```markdown
# Implementation Plan: [Feature Name]

> Source: `path/to/spec.md`
> Generated: YYYY-MM-DD

---

## Phase 0 — Tracer Bullet(s)
> [One sentence describing the minimal end-to-end slice(s)]

### [Tracer Bullet Name]
- [ ] Task description (specific file or module reference when known)
- [ ] Task description
- [ ] Task description

### [Second Tracer Bullet Name] (if distinct subsystem/path)
- [ ] Task description
- [ ] Task description

---

## Phase 1 — [Theme: e.g., Core Logic]

### [Chunk Name]
- [ ] Task description
- [ ] Task description

### [Chunk Name]
- [ ] Task description
- [ ] Task description

---

## Phase 2 — [Theme: e.g., Edge Cases & Validation] (if needed)

### [Chunk Name]
- [ ] Task description

---

## Phase 3 — [Theme: e.g., Polish & Cleanup] (if needed)

### [Chunk Name]
- [ ] Task description
```

## Chunk Guidelines

- **Small** — A chunk should be 2-6 tasks. If it's larger, split it.
- **Cohesive** — All tasks in a chunk relate to the same concern or module.
- **Independent** — Chunks within a phase can ideally be done in any order.
  Note dependencies between chunks with `(depends on: Chunk Name)` when needed.
- **Specific** — Reference actual files, functions, or modules where known.
  Avoid vague tasks like "set up the backend."

## Phase Guidelines

- **Phase 0** — Always the tracer bullet(s). One chunk per distinct end-to-end
  path. Usually 1, but use more when the spec spans independent subsystems.
- **Phase 1** — Core functionality. The happy paths that make the feature work.
- **Phase 2** — Edge cases, error handling, validation.
- **Phase 3** — Polish, cleanup, documentation, performance. Only if needed.
- Scale to the spec. A small feature may only need Phase 0 + 1. A large PRD
  may need 4+ phases. Don't pad phases to fill the template.

## Rules

- Do NOT include effort estimates or sizing
- Do NOT add explanatory prose between chunks — the plan is a living checklist
- DO reference specific files/modules discovered during codebase exploration
- DO keep task descriptions to a single line
- If the spec is ambiguous, note assumptions inline as `> **Assumption:** ...`
