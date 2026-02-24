# ARCHITECTURE.md Guidelines

## Purpose

An ARCHITECTURE.md gives new and occasional contributors the mental map that core maintainers carry in their heads. Without it, contributors spend most of their time figuring out *where* to make changes rather than *how* to make them. The document is a map of the country, not an atlas of every state.

## Document Structure

Use this structure. Omit a section only if the project genuinely has nothing to say for it.

```
# Architecture of [Project Name]

## Bird's Eye View
## Code Map
## Cross-Cutting Concerns
## Architectural Invariants
```

### Bird's Eye View

One to three paragraphs answering:

- What problem does this project solve?
- What is the high-level approach / strategy?
- What are the major moving parts and how do they relate?

Do not describe implementation details. A reader should finish this section knowing what the project *is* and roughly how it works at the 10,000-foot level.

### Code Map

The core of the document. Walk through the top-level directory/module structure and explain what each piece is responsible for. For each entry:

- **Name the directory, file, module, or type directly** (e.g., `src/parser/`, `crates/hir/`, `AppContext`). Never use markdown links — they rot. Readers should use symbol search (Ctrl+Shift+O, grep, etc.) to find named entities.
- **State what it does in one or two sentences.** Answer "what does this module accomplish?" not "how does it work internally?"
- **Call out key types, traits, or files** within the module when they are important landmarks.

Organize the code map to mirror the physical directory layout. If logical groupings don't match the physical layout, note that — it may indicate the directory structure should be refactored.

Example entry:

```markdown
### `src/parser/`

Turns source text into a Concrete Syntax Tree (CST). The main entry point is
`parse()` in `src/parser/lib.rs`. Key types: `Token`, `Event`, `TreeSink`.
Does NOT do name resolution or type checking — that happens in `src/hir/`.
```

### Cross-Cutting Concerns

Describe patterns and conventions that span multiple modules:

- Error handling strategy
- Logging / observability approach
- Testing conventions (unit vs integration, fixture patterns)
- Configuration and environment handling
- Performance-sensitive paths or hot loops

Keep each item to one or two sentences. Link to more detailed docs only if they exist elsewhere.

### Architectural Invariants

State rules the codebase enforces, **especially constraints expressed as the absence of something**. These are the hardest things for newcomers to discover on their own.

Examples:
- "The `core` crate has zero dependencies on the `ui` crate."
- "All database access goes through the `Repository` trait — no raw SQL outside `src/db/`."
- "We never store user passwords; only bcrypt hashes."
- "The parser does not allocate heap memory."

Frame each invariant as a clear, falsifiable statement.

## Writing Rules

1. **Keep it short.** Every recurring contributor must read it. Target under 300 lines. If you can't fit it, the architecture may need simplifying — or you're writing too much detail.

2. **Keep it high-level.** Describe *what* each module does, not *how* it does it. Implementation details belong in code comments or separate docs.

3. **Keep it stable.** Only document structural elements unlikely to change month-to-month. The document should need updating a few times per year, not every sprint.

4. **Name things, don't link them.** Write `src/parser/lib.rs`, not `[parser](./src/parser/lib.rs)`. Links go stale silently; names can be searched.

5. **State what is NOT done.** Invariants expressed as absence ("X never depends on Y", "we don't use Z") are the most valuable and hardest-to-discover architectural facts. Call them out explicitly.

6. **Reflect on the layout.** If the code map reveals that logically related pieces are scattered across distant directories, flag it. The act of writing the architecture doc is a chance to evaluate whether the physical layout matches the logical architecture.

7. **Use concrete names.** Refer to specific files, types, functions, and modules. Vague phrases like "the data layer" are less useful than `src/db/repository.rs`.

8. **Write for a new contributor.** Assume the reader is a competent developer who has never seen this codebase. Don't assume knowledge of internal jargon, historical decisions, or tribal conventions.

## Anti-Patterns to Avoid

- **The exhaustive atlas**: Documenting every file, every function. This is unmaintainable and unreadable.
- **The API reference**: Listing function signatures. That belongs in rustdoc / JSDoc / generated docs.
- **The history lesson**: Explaining *why* past decisions were made. Keep it to the present architecture. Use ADRs for historical context.
- **The aspirational doc**: Describing the architecture you *want* rather than the one that *exists*.
- **Link-heavy maps**: Hyperlinks go stale. Use plain text names that readers can search for.
- **Synchronized docs**: Don't try to keep the doc in perfect sync with every code change. Write stable truths and review periodically.
