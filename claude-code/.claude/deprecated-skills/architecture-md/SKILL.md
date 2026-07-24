---
name: architecture-md
description: "Generate or update an ARCHITECTURE.md file for a codebase. Use when the user asks to create, write, update, or improve an ARCHITECTURE.md, or asks for a high-level architectural overview document of their project."
---

# ARCHITECTURE.md Generator

Generate a concise, high-value ARCHITECTURE.md that gives contributors a mental map of the codebase. The document answers: "Where do I make a change for feature X?" — not "How does module Y work internally?"

## Process

1. **Explore the codebase** — read the project root, directory tree, key config files (package.json, Cargo.toml, etc.), and entry points to build a mental model
2. **Identify the architecture** — determine top-level modules, key types, important files, data flow, and layer boundaries
3. **Draft the document** — follow the structure and rules in `references/guidelines.md`
4. **Review with the user** — present the draft, iterate based on feedback
5. **Write the file** — save as `ARCHITECTURE.md` at the project root

## Key Rules

- Read `references/guidelines.md` before writing any content
- Explore broadly before writing — read directory listings and key files across the entire project, not just one area
- Keep the document under 300 lines; aim for the length of a single README section
- Name files, modules, and types directly — never use hyperlinks (they rot)
- State architectural invariants, especially things the codebase deliberately does NOT do
- Write for a new contributor, not for yourself

## Resources

### references/
- `guidelines.md` — the complete set of rules and structure for writing ARCHITECTURE.md files. Always read this before generating content.
