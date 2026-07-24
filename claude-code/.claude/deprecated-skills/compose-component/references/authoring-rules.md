# Component Authoring Rules

These rules are derived from the shadcn/ui component conventions observed in the
project's `src/components/ui/` directory. Every component produced by this skill
MUST follow these rules.

---

## 1. File Structure

One file per component family. All sub-components live in the same file.

```
src/components/ui/swipe-card.tsx
  → SwipeCard, SwipeCardHeader, SwipeCardContent, SwipeCardFooter, ...
```

Ordering within the file:
1. Imports
2. Context definitions (if any)
3. CVA variant definitions (if any)
4. Component functions (root → leaf order)
5. Single `export {}` block at the bottom

---

## 2. Function Declarations

Always use `function` declarations, never arrow functions, for component definitions.

**Correct:**
```tsx
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("...", className)} {...props} />
}
```

**Incorrect:**
```tsx
const CardHeader = ({ className, ...props }: ...) => { ... }
const CardHeader = React.forwardRef(...)  // not needed in modern React
```

---

## 3. The `data-slot` Attribute

Every sub-component MUST have a `data-slot` attribute on its root element.
The value is the kebab-case version of the component name.

```tsx
function SwipeCardHeader(...) {
  return <div data-slot="swipe-card-header" ... />
}
```

Purpose:
- Enables parent components to target children via CSS (`has-data-[slot=...]`)
- Provides a stable selector for styling relationships between components
- Used extensively in shadcn/ui for `group-data-*` and `has-data-*` patterns

---

## 4. The `className` Prop

Every sub-component MUST:
1. Accept `className` as a prop
2. Merge it with base classes using `cn()` from the project's utils
3. Place `className` **last** in the `cn()` call so consumer styles win

```tsx
function SwipeCardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="swipe-card-content"
      className={cn("px-6 flex flex-col gap-4", className)}
      {...props}
    />
  )
}
```

---

## 5. Props Spreading

Every sub-component MUST spread `...props` on its root element. This ensures
consumers can pass `id`, `aria-*`, `data-*`, event handlers, and any other
native attributes through.

```tsx
function SwipeCard({ className, direction = "horizontal", ...props }:
  React.ComponentProps<"div"> & { direction?: "horizontal" | "vertical" }
) {
  return (
    <div
      data-slot="swipe-card"
      data-direction={direction}
      className={cn("...", className)}
      {...props}
    />
  )
}
```

---

## 6. TypeScript Typing

Use `React.ComponentProps<"element">` intersected with custom props.
Do NOT use `React.FC`, `React.PropsWithChildren`, or separate `interface` declarations
unless the props type is reused.

```tsx
// Simple — no custom props
function CardContent({ className, ...props }: React.ComponentProps<"div">) { ... }

// Custom props — intersection type inline
function Card({ className, size = "default", ...props }:
  React.ComponentProps<"div"> & { size?: "default" | "sm" }
) { ... }

// Wrapping a primitive — use the primitive's prop type
function DialogContent({ className, children, showCloseButton = true, ...props }:
  DialogPrimitive.Popup.Props & { showCloseButton?: boolean }
) { ... }
```

### Proxy / wrapper components — derive props from the source

When a sub-component wraps another component (e.g., a card item wrapping `<Item>`),
derive its props with `React.ComponentProps<typeof WrappedComponent>` instead of
manually re-declaring types. This creates a single source of truth — if the wrapped
component adds or changes props, the wrapper automatically stays in sync.

```tsx
// ✅ Correct — props derived from Item
function SwipeListCardItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Item>) {
  const { x, handleDragEnd } = useSwipeListCard();
  return (
    <motion.div style={{ x }} drag="x" onDragEnd={handleDragEnd} ...>
      <Item className={cn("rounded-none border-transparent", className)} {...props}>
        {children}
      </Item>
    </motion.div>
  );
}

// ❌ Incorrect — manually duplicated types that drift from Item
function SwipeListCardItem({
  variant = "default",
  size = "default",
  className,
  children,
}: {
  variant?: "default" | "outline" | "muted";
  size?: "default" | "sm" | "xs";
  className?: string;
  children?: React.ReactNode;
}) { ... }
```

This pattern applies whenever a sub-component is a proxy for another:
- `React.ComponentProps<typeof Item>` — wraps a project component
- `React.ComponentProps<typeof motion.div>` — wraps a motion element
- `DialogPrimitive.Popup.Props` — wraps a primitive (same idea, different syntax)

---

## 7. Variants with CVA

When a component has multiple visual variants, use `class-variance-authority` (CVA).

```tsx
import { cva, type VariantProps } from "class-variance-authority"

const chipVariants = cva(
  "h-auto rounded-lg justify-center text-left relative",  // base classes
  {
    variants: {
      variant: {
        default: "border-border bg-background text-muted-foreground",
        outline: "border-border bg-input/30 text-muted-foreground",
      },
      size: {
        default: "px-4 py-2.5",
        sm: "px-3 py-1.5 text-xs",
        lg: "px-5 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

The component then types its props with `VariantProps<typeof chipVariants>` and
passes variant values to the CVA function:

```tsx
function Chip({ className, variant, size, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof chipVariants>
) {
  return (
    <button
      data-slot="chip"
      className={cn(chipVariants({ variant, size }), className)}
      {...props}
    />
  )
}
```

Export variant definitions when other components need them (e.g., a group component
reusing the item's variants):

```tsx
export { Chip, ChipGroup, chipVariants }
```

---

## 8. Flat Hierarchy — Expose Internal Layers

When a component has internal structure (backgrounds, overlays, drag wrappers, etc.),
**extract each layer as a composable sub-component** rather than hiding it behind
the parent's implementation. The consumer should be able to style and customize every
visual layer without fighting specificity or reaching through implementation details.

### The problem: buried structure

```tsx
// ❌ Monolithic — keep/dismiss backgrounds, drag wrapper, and Item are all
// hidden inside SwipeListCard. Consumer cannot style the image, change
// background colors, or customize the keep/dismiss indicators.
function SwipeListCard({ value, keepLabel, dismissLabel, children }) {
  return (
    <motion.div>
      <div className="relative overflow-hidden">
        <div style={{ background: "oklch(...)" }}>...</div>   {/* hidden keep bg */}
        <div style={{ background: "oklch(...)" }}>...</div>   {/* hidden dismiss bg */}
        <motion.div drag="x">                                  {/* hidden drag wrapper */}
          <Item>{children}</Item>                               {/* hidden Item */}
        </motion.div>
      </div>
      <Separator />                                             {/* hidden separator */}
    </motion.div>
  );
}
```

### The solution: flat composable layers

```tsx
// ✅ Each layer is a named sub-component the consumer composes and styles
<SwipeListCard value={meal}>
  <SwipeListCardCanvas>
    <SwipeListCardKeep />
    <SwipeListCardDismiss />
    <SwipeListCardItem className="...">
      <ItemMedia variant="image" className="size-16 rounded-lg">
        <img src={imageUrl} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{meal.name}</ItemTitle>
      </ItemContent>
    </SwipeListCardItem>
  </SwipeListCardCanvas>
  <Separator className="my-0" />
</SwipeListCard>
```

### Guidelines

- **If it has a class, it should be a component.** Any `div` with meaningful styling
  (positioning, overflow, background) is a candidate for extraction.
- **Use `data-state` for dynamic styling.** Instead of inline styles that consumers
  can't override, use data attributes and Tailwind's `data-[state=*]:` modifiers:
  ```tsx
  data-state={triggered ? "triggered" : active ? "active" : "idle"}
  className={cn(
    "bg-[oklch(0.85_0.08_155)]",
    "data-[state=active]:bg-[oklch(0.75_0.16_155)]",
    "data-[state=triggered]:bg-[oklch(0.62_0.20_155)]",
    className,  // consumer can override any state's color
  )}
  ```
- **Smart defaults, full override.** Sub-components should render sensible defaults
  (icons, labels) but accept `children` for full replacement when needed.
- **Card-level context** for shared state. When sub-components need to share motion
  values, swipe direction, or triggered state, provide a card-level context via the
  root component and expose a `useComponentCard()` hook.

---

## 9. Context for Configuration Distribution

When a parent component needs to pass configuration (variant, size, orientation, etc.)
to its children without prop drilling, use React Context.

```tsx
const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
  orientation: "horizontal",
})
```

The root component provides the context:

```tsx
function ToggleGroup({ variant, size, spacing, children, ...props }) {
  return (
    <ToggleGroupPrimitive {...props}>
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}
```

Child components consume it:

```tsx
function ToggleGroupItem({ variant = "default", size = "default", ...props }) {
  const context = React.useContext(ToggleGroupContext)
  // context values take precedence over direct props
  const resolvedVariant = context.variant || variant
  ...
}
```

**When to use context:**
- Parent distributes shared configuration to multiple children (variant, size, orientation)
- Children need to adapt their behavior based on parent state
- Prop drilling would be 2+ levels deep

**When NOT to use context:**
- Simple layout containers that just wrap children with styling
- Components with no shared state between parent and children

---

## 10. Wrapping Primitives

When wrapping Radix UI or Base UI primitives:

1. Import the primitive
2. Create a function component that renders the primitive
3. Add `data-slot`, `className` merging, and `...props` spreading
4. Use the primitive's prop types

```tsx
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
```

---

## 11. Data Attributes for State

Use `data-*` attributes to expose component state for CSS targeting. This enables
parent/sibling styling via `group-data-*` and `has-data-*`.

```tsx
function SwipeCard({ direction = "horizontal", size = "default", ...props }) {
  return (
    <div
      data-slot="swipe-card"
      data-direction={direction}
      data-size={size}
      ...
    />
  )
}
```

Children can then use:
```
group-data-[direction=vertical]/swipe-card:flex-col
group-data-[size=sm]/swipe-card:px-4
```

---

## 12. Naming Conventions

| Concept | Convention | Example |
|---------|-----------|---------|
| File name | kebab-case | `swipe-card.tsx` |
| Component name | PascalCase, prefixed with parent name | `SwipeCardHeader` |
| data-slot value | kebab-case of component name | `swipe-card-header` |
| CVA variable | camelCase + `Variants` suffix | `swipeCardVariants` |
| Context variable | PascalCase + `Context` suffix | `SwipeCardContext` |
| CSS group name | kebab-case of root component | `group/swipe-card` |

---

## 13. Exports

Single `export {}` block at the bottom of the file. Named exports only, never default.

```tsx
export {
  SwipeCard,
  SwipeCardHeader,
  SwipeCardTitle,
  SwipeCardDescription,
  SwipeCardContent,
  SwipeCardFooter,
  SwipeCardAction,
  swipeCardVariants,        // export CVA definitions if other components need them
}
```

---

## 14. Styling Rules

These rules align with shadcn/ui conventions:

- **Semantic colors only** — `bg-card`, `text-muted-foreground`, never `bg-blue-500`
- **`gap-*` for spacing** — never `space-x-*` or `space-y-*`
- **`size-*` for equal dimensions** — `size-10` not `w-10 h-10`
- **`truncate` shorthand** — not `overflow-hidden text-ellipsis whitespace-nowrap`
- **`cn()` for conditional classes** — not template literal ternaries
- **No manual `dark:` overrides** — semantic tokens handle dark mode
- **No manual `z-index` on overlays** — let the primitive handle stacking
- **`className` for layout, not color overrides** — consumers use `className` for
  positioning (`mt-4`, `max-w-md`), not to restyle the component
