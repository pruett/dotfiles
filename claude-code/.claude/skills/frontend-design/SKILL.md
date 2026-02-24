---
name: frontend-design
description: >
  Frontend design and implementation guidelines for building polished, accessible,
  production-quality web interfaces. This skill should be used any time the agent is
  writing, reviewing, or modifying frontend code — React components, HTML markup,
  CSS/Tailwind styling, layout, forms, animations, accessibility, or UI composition.
  Triggers on: creating or editing components, writing JSX/TSX, working with shadcn/ui
  or any component library, implementing layouts, styling with Tailwind/CSS, building
  forms, adding animations, handling dark mode, or any task involving user-facing
  web interface code.
---

# Frontend Design

Apply these guidelines whenever writing or modifying frontend code. This skill uses
progressive disclosure — read only the reference files relevant to the current task.

## Decision Router

Before writing any UI code, determine which references apply to the current task:

### Working with components or UI primitives?

Read `references/component-abstraction.md` when:
- Using shadcn/ui, Radix, or any component library
- Creating new components or composing existing ones
- Encountering bare `<div>`/`<span>` markup with Tailwind classes in render functions
- Building layouts, cards, dialogs, tables, or any named UI pattern
- Deciding whether to use an existing component vs. writing custom markup

### Writing or reviewing any visible UI?

Read `references/web-interface-guidelines.md` when:
- Implementing forms, inputs, or interactive controls
- Adding animations or transitions
- Handling accessibility (ARIA, keyboard navigation, focus states)
- Working with images, typography, or content display
- Implementing dark mode or theming
- Building navigation, modals, drawers, or stateful UI
- Formatting dates, numbers, or user-facing copy
- Reviewing UI code for quality or compliance

### Multiple references may apply

For most non-trivial frontend tasks, both references are relevant. Read
`component-abstraction.md` first (it's shorter and guides structural decisions),
then consult `web-interface-guidelines.md` for the specific UI patterns in play.

## Core Principle

Every piece of frontend code should be **readable at the intent level**. A render
function should tell you *what* the UI is, not *how* it's styled. Reference files
provide the specific rules to achieve this.

## Resources

### references/
- `component-abstraction.md` — Rules for component composition, shadcn/ui usage,
  and when to extract abstractions. Read when working with components or encountering
  bare markup that should be a named component.
- `web-interface-guidelines.md` — Comprehensive checklist for web interface quality:
  accessibility, forms, animation, typography, performance, navigation, dark mode,
  i18n, and anti-patterns. Read when implementing or reviewing any visible UI element.
