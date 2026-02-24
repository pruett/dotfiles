# Component Abstraction Rules

## The Core Rule

Every visible UI element should be backed by a named component — either a shadcn/ui
primitive, an AI SDK Elements component, or a project-level component built following
the same patterns. **A `<div>` with a long string of Tailwind classes in a render
function is a code smell.** It signals missing abstraction.

## Bare Markup Checklist

When you encounter bare markup during implementation, apply this checklist:

1. **Does shadcn/ui already have a component for this?** Use it. (`Card`, `Badge`,
   `Table`, `Alert`, `Separator`, `ScrollArea`, etc.)
2. **Does AI SDK Elements have a component for this?** Use it. (`Conversation`,
   `ConversationContent`, `ConversationScrollButton`, etc.)
3. **Neither library covers it?** Create a project-level component in `src/components/`
   following shadcn/ui conventions:
   - Accept `className` prop, merge with `cn()`
   - Use CSS variables for theme tokens
   - Use `cva` (class-variance-authority) for variant definitions
   - Keep the component focused on a single responsibility
   - Co-locate the component with its variants (e.g., `ConversationBubble` with
     `variant="user" | "assistant"`)

## Layout Containers Too

This applies to layout containers — a two-column split should be a `<PanelLayout>`,
not a bare `<div className="flex ...">`. The goal is that reading a render function
tells you *what* the UI is, not *how* it's styled.

## shadcn/ui Conventions for Custom Components

When creating project-level components that don't exist in shadcn/ui:

```tsx
// Pattern: component with variants using cva
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      status: {
        active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        inactive: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
        error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      },
    },
    defaultVariants: {
      status: "active",
    },
  }
)

interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {}

function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ status }), className)} {...props} />
  )
}
```

### Key Conventions

- **`cn()` for className merging** — always the last argument, always accepts consumer overrides
- **`cva` for variants** — not conditional ternaries scattered through the className string
- **Forward `...props`** — components are transparent to HTML attributes
- **`React.HTMLAttributes<Element>`** — extend the correct base element type
- **CSS variables for theme tokens** — `var(--primary)` not `blue-500`
- **Single responsibility** — one component, one job. Compose don't configure.
