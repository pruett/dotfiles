---
name: compose-component
description: >
  Compose a new UI component following shadcn/ui authoring patterns — composable,
  modular, multi-export React components with Tailwind styling hooks. Use when the
  user wants to create a new React component, abstract an existing one, or build a
  composable component family (e.g., SwipeCard + SwipeCardHeader + SwipeCardItem).
  Triggers on "compose a component", "create a component", "abstract this into a component",
  "make this composable", "new UI component", "/compose-component", or when a user
  wants to follow shadcn/ui component patterns for a custom component.
---

# Compose Component

Author composable, modular React components that follow the conventions established
by shadcn/ui. Every component produced by this skill should feel like it belongs in
`components/ui/` — same patterns, same ergonomics, same quality.

## Bootstrap

1. **Load the shadcn skill** — run `/shadcn` to activate the shadcn/ui skill context.
   If the skill is unavailable, proceed without it — the rules below are self-contained.
2. **Read existing components** — glob `src/components/ui/*.tsx` and read 2–3 files
   to calibrate to the project's exact conventions (import paths, `cn()` location,
   primitive library in use — Radix vs Base UI, CVA usage patterns, etc.).

## Phase 1: API Design (do NOT skip)

Before writing any code, define the component's public API with the user. This is the
most important phase — get alignment here before touching a file.

### 1a. Understand Requirements

Ask the user:

- **What is this component?** Name, purpose, and where it will be used.
- **What data does it display or manage?** Inputs, state, user interactions.
- **Are there existing primitives to wrap?** (Radix, Base UI, native HTML elements)
- **What variants or sizes are needed?** (e.g., `variant="outline"`, `size="sm"`)

### 1b. Define Sub-Components

Propose the component family. Every shadcn-style component exports multiple
composable pieces from a single file. For a component named `SwipeCard`:

```
SwipeCard          — root container, optional context provider
SwipeCardHeader    — top section (title, description, actions)
SwipeCardContent   — main body
SwipeCardFooter    — bottom section (actions, metadata)
SwipeCardItem      — repeated child element (if applicable)
SwipeCardTrigger   — interactive element that initiates behavior (if applicable)
```

For each sub-component, specify:
- **Element type** — what HTML element or primitive it wraps
- **Custom props** — beyond `className` and `children`
- **Variants** — if it uses CVA, list variant names and values

### 1c. Define Context / Provider (if needed)

If the root component needs to distribute state or configuration to children:
- What values flow through context? (variant, size, orientation, open state, etc.)
- Is the provider the root component itself, or a separate `*Provider` export?
- Reference `ToggleGroup` → `ToggleGroupContext` as the canonical example.

### 1d. Present the API Spec

Present a concise summary to the user:

```
Component: SwipeCard
File: src/components/ui/swipe-card.tsx

Exports:
  SwipeCard          — div, props: { direction?: "horizontal" | "vertical" }
  SwipeCardHeader    — div, props: {}
  SwipeCardTitle     — div, props: {}
  SwipeCardContent   — div, props: {}
  SwipeCardFooter    — div, props: {}
  SwipeCardAction    — button, props: { variant?: "accept" | "reject" }

Context: SwipeCardContext { direction }
Variants: swipeCardActionVariants (variant: accept | reject)
```

**Wait for user confirmation before proceeding to Phase 2.**

## Phase 2: Implementation

Write the component file following the rules in `references/authoring-rules.md`.

### File Structure

Follow this exact ordering in the file:

```tsx
// 1. Imports
import * as React from "react"
import { cn } from "~/lib/utils"                    // always
import { cva, type VariantProps } from "class-variance-authority"  // if variants

// 2. Context (if needed)
const ComponentContext = React.createContext<{...}>({...})

// 3. Variant definitions (if needed)
const componentVariants = cva("base-classes", { variants: {...} })

// 4. Sub-components — one function per component, ordered from root → leaf
function Component({ className, ...props }) { ... }
function ComponentHeader({ className, ...props }) { ... }
function ComponentContent({ className, ...props }) { ... }
function ComponentFooter({ className, ...props }) { ... }

// 5. Named exports — single export block at the bottom
export { Component, ComponentHeader, ComponentContent, ComponentFooter }
```

### Implementation Checklist

Before presenting the code, verify every item:

- [ ] Every sub-component has `data-slot="kebab-case-name"` on its root element
- [ ] Every sub-component accepts and merges `className` via `cn(..., className)`
- [ ] Every sub-component spreads `...props` on its root element
- [ ] Types use `React.ComponentProps<"element">` intersected with custom props
- [ ] Proxy/wrapper sub-components derive props via `React.ComponentProps<typeof WrappedComponent>`
- [ ] Function declarations (not arrow functions) for all components
- [ ] `cn()` imported from the project's utils path (check existing files)
- [ ] Context default values match the component's default prop values
- [ ] Variants use CVA, not inline conditionals
- [ ] No default exports — only named exports in a single `export {}` block
- [ ] File is self-contained — all sub-components in one file
- [ ] Semantic Tailwind tokens (`bg-card`, `text-muted-foreground`), no raw colors
- [ ] `gap-*` for spacing, never `space-x-*` / `space-y-*`
- [ ] `size-*` when width and height are equal

## Phase 3: Review

After writing the file:

1. Read back the file to confirm it compiled correctly with the project's patterns.
2. Suggest usage examples showing the component composed in a realistic scenario.
3. Ask if any sub-components need additional props or variants.

## Anti-Patterns

Do NOT:
- Create a monolithic component with conditional rendering for sub-parts
- Bury styled divs inside a component — if it has meaningful styling, extract it as a composable sub-component (see authoring-rules §8: Flat Hierarchy)
- Use inline styles for dynamic state — use `data-state` attributes with Tailwind `data-[state=*]:` modifiers so consumers can override via `className`
- Manually re-declare prop types that a wrapped component already defines — use `React.ComponentProps<typeof WrappedComponent>` (see authoring-rules §6: Proxy components)
- Use `children` type-checking to swap behavior (use explicit sub-components)
- Add `styled-components` or CSS modules — Tailwind only via `cn()`
- Use default exports
- Skip the API design phase
- Add unnecessary abstraction (a simple wrapper doesn't need context)
- Over-engineer — only add context/providers when state genuinely needs to flow down

## References

- `references/authoring-rules.md` — the complete set of component authoring rules
