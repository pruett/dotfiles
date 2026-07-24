---
name: component-spec
description: >
  Write a detailed component specification extracted from an architectural document.
  Use when the user asks to create a spec, write a specification, detail a component,
  or define requirements for a component within a larger system. Triggers when the user
  references an architecture doc (ARCHITECTURE.md or similar) and wants to drill into
  a specific component's requirements, interfaces, behavior, and validation criteria.
  Also use when the user says "spec out", "write a spec for", or "/component-spec".
---

# Component Spec

Extract a component from a high-level architectural document and produce a thorough,
standalone specification. The architecture doc describes the world; this skill zooms
into one piece of it and defines exactly how it should work.

## Process

1. **Locate the architecture doc** — ask the user for the path if not provided.
   Read it completely.
2. **Identify the target component** — confirm which component the user wants
   specified. If ambiguous, list the components found and ask.
3. **Extract known context** — pull everything the architecture doc says about
   this component: purpose, boundaries, dependencies, constraints.
4. **Interrogate the user** — read `references/interrogation-guide.md` and
   systematically fill knowledge gaps. Start with purpose and boundaries, then
   drill into interfaces, behavior, failure modes, and validation. Batch 2-4
   questions per round. Reflect back a summary after each round for confirmation.
5. **Draft the spec** — read `references/spec-template.md` and produce the
   specification. Adapt the template to the component — remove irrelevant sections,
   add component-specific ones.
6. **Review with the user** — present the draft, iterate on feedback.
7. **Save the spec** — write to `specs/<component-name>.md` relative to the
   project root. Create the `specs/` directory if it doesn't exist.

## Interrogation Rules

- Read `references/interrogation-guide.md` before starting questions.
- Never ask questions already answered by the architecture doc.
- Ask the most impactful questions first (purpose > interfaces > behavior > edge cases).
- Use "what if" scenarios to uncover failure modes and edge cases.
- Ask for concrete examples when requirements are abstract.
- Challenge vague qualifiers: "fast," "reliable," "scalable" — get numbers.
- Summarize after every 2-3 rounds and ask for corrections.
- Stop when the user signals completeness or answers start repeating.

## Spec Quality Checklist

Before presenting the final draft, verify:

- [ ] Every functional requirement has acceptance criteria (Given/When/Then)
- [ ] Interfaces have schemas or examples, not just descriptions
- [ ] Failure modes are enumerated with explicit handling strategies
- [ ] Diagrams show the component in context (at least one context diagram)
- [ ] No requirement uses vague language without quantification
- [ ] Open questions are captured with impact and owner

## Output Conventions

- Use Mermaid for diagrams (context, sequence, state machine) where appropriate.
- Use tables for structured data (error handling, metrics, data models).
- Use Given/When/Then for acceptance criteria.
- Number requirements (FR-1, FR-2, NFR-1) for traceability.
- Include the source architecture doc path in the spec header.

## Resources

### references/
- `interrogation-guide.md` — question categories and techniques for extracting
  requirements from the user. Read before starting the interrogation phase.
- `spec-template.md` — the specification document structure. Read before drafting.
  Adapt sections to fit the component; not every section applies.
