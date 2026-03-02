# PRD Template

Use this structure for the output file. Adapt to the content — skip empty
sections, scale task detail to complexity.

```markdown
# PRD

> Source: `path/to/input-file.md`
> Generated: YYYY-MM-DD
> Total tasks: N (X simple, Y medium, Z complex)

---

## [Category Name]

### T-01: [Task Title] `[simple|medium|complex]`

**Description:** What needs to change and why.

**Affected files:**
- `path/to/file.ext` — what changes here

**Done when:** Single sentence defining completion for simple tasks.

---

### T-02: [Task Title] `[medium]`

**Description:** What needs to change and why. Include relevant context
discovered during codebase exploration.

**Affected files:**
- `path/to/file.ext` — what changes here
- `path/to/other.ext` — what changes here

**Requirements:**
- Requirement 1
- Requirement 2
- Requirement 3

**Acceptance criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

---

### T-03: [Task Title] `[complex]`

**Description:** What needs to change, why, and the broader context. Include
motivation, current behavior, and desired behavior.

**Affected areas:**
- `path/to/module/` — description of changes
- `path/to/api/` — description of changes
- `path/to/tests/` — tests to add or update

**Requirements:**
- Requirement 1
- Requirement 2
- Requirement 3

**Edge cases:**
- Edge case 1 — how to handle
- Edge case 2 — how to handle

**Acceptance criteria:**
- [ ] Given [precondition], when [action], then [outcome]
- [ ] Given [precondition], when [action], then [outcome]
- [ ] Given [precondition], when [action], then [outcome]

**Open questions:**
- [ ] Question about unresolved design decision

---

## [Next Category]

### T-04: ...

---

## Deferred / Needs Clarification

Items from the source file that could not be turned into actionable tasks.

| # | Original text | Reason |
|---|---------------|--------|
| 1 | "..." | Too vague — unclear which component is affected |
| 2 | "..." | Contradicts T-03 — needs user decision |
```

## Template Rules

- Number tasks sequentially across the entire PRD (T-01, T-02, ...) regardless
  of category
- Tag each task with its complexity tier after the title
- Simple tasks: title + description + affected file(s) + done-when. That's it.
- Medium tasks: add requirements + acceptance criteria
- Complex tasks: add edge cases + Given/When/Then criteria + open questions
- The "Deferred / Needs Clarification" section is optional — only include it
  if items were actually deferred
- Within each category, order tasks by priority (blocking/critical first)
- Every task must be independently implementable — no implicit ordering
  dependencies unless explicitly noted with `(depends on: T-XX)`
