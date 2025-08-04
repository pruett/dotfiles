# Bootstrap Project
Bootstrap a new project with standardized documentation structure

## Description
This command initializes a new project with the complete documentation structure and configuration files needed for the Claude Code development workflow. It creates the `.ai/` directory with project-specific documentation and copies over your global standards.

## Process

### 1. Create .ai directory structure
```bash
mkdir -p .ai/
mkdir -p .ai/features
mkdir -p .ai/docs
```

### 2. Create vision.md template
Create `.ai/vision.md` with project vision template:
```markdown
# Project Vision & Scope

## Purpose
[Clear statement of what this project does and why it exists]

## Target Users
[Specific user personas and their needs]

## Core User Flows
[Key user journeys with step-by-step descriptions]

## Scope Boundaries
[What this project does and doesn't handle]

## Success Metrics
[How you measure project success]
```

### 3. Copy standard documentation files
- Copy `~/.claude/standards/stack.md` to `.ai/stack.md`
- Copy `~/.claude/standards/best-practices.md` to `.ai/best-practices.md`
- Copy `~/.claude/standards/testing.md` to `.ai/testing.md`

### 4. Create CLAUDE.md file
Create `CLAUDE.md` in project root with the following content:
```markdown
# Project Context & Development Guidelines

## Quick Reference
- @.ai/vision.md: Project scope, purpose, target users, user flows
- @.ai/stack.md: Technology choices, frameworks, libraries, tools
- @.ai/best-practices.md: Coding preferences, patterns, data fetching
- @.ai/testing.md: Testing frameworks, examples, guidelines

## Bash Commands
- pnpm run build: Build the project
- pnpm run typecheck: Run TypeScript checker
- pnpm test: Run test suite
- pnpm run dev: Start development server

## File Organization
- @.ai/features/: All feature specifications organized by date
- @.ai/docs/: Extended documentation and architecture diagrams

## Development Workflow
1. Always reference all four documentation files when creating specifications
2. Place feature specs in @.ai/features/YYYY-MM-DD-feature-name/
3. Run typechecker and tests before commits
4. Update relevant documentation when features are completed
```

## Success Output
After successful execution, display:
```
✅ Project bootstrapped successfully!

Created:
- .ai/vision.md (template - please update with your project details)
- .ai/stack.md (copied from ~/.claude/standards/)
- .ai/best-practices.md (copied from ~/.claude/standards/)
- .ai/testing.md (copied from ~/.claude/standards/)
- CLAUDE.md (project context file)
- .ai/features/ directory
- .ai/docs/ directory

Next steps:
1. Edit .ai/vision.md to define your project scope
2. Review and customize .ai/stack.md if needed for this project
3. Update CLAUDE.md bash commands section with your actual scripts
4. Run '/create-feature' to start building your first feature
```

## Error Handling
- If `.ai/` directory already exists, ask for confirmation before overwriting
- If standard files don't exist in `~/.claude/standards/`, provide helpful error message
- If file copy fails, report which file failed and why
- Continue with other files even if one fails

## Implementation Notes
Use bash commands to create directories and copy files. Ensure proper error handling and user feedback throughout the process.
