# Code Style Guide

> Version: 1.0.0
> Last Updated: 2025-07-23

## Context

This file is part of the Agent OS standards system. These global code style rules are referenced by all product codebases and provide default formatting guidelines. Individual projects may extend or override these rules in their `.agent-os/product/code-style.md` file.

## General Formatting

All projects should have a prettier configuration file defined at the root of the project. This file will format the codebase according to the rules defined in this file. In addition, a linter, like ESLint, might be used to enforce additional formatting rules. These tools should be configured in such a way that they are automatically run as part of the build/save process. Refer to the rules defined in these files to determine the best practices for formatting.

### Tools
- Prettier
- ESLint

### Indentation
- Use 2 spaces for indentation (never tabs)
- Maintain consistent indentation throughout files

### Naming Conventions
- **Methods and Variables**: Use camelCase (e.g., `userProfile`, `calculateTotal`)
- **Classes and Modules**: Use PascalCase (e.g., `UserProfile`, `PaymentProcessor`)
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`)
- **Filenames**: Use kabob-case (e.g., `max-retry-count.js`, `user-profile.ts`)

## Code Comments

### When to Comment
- Add brief comments above non-obvious business logic
- Document complex algorithms or calculations
- Explain the "why" behind implementation choices

### Comment Maintenance
- Never remove existing comments unless removing the associated code
- Update comments when modifying code to maintain accuracy
- Keep comments concise and relevant

### Comment Format
```typescript
// Calculate compound interest with monthly contributions
// Uses the formula: A = P(1 + r/n)^(nt) + PMT × (((1 + r/n)^(nt) - 1) / (r/n))
function calculateCompoundInterest(principal: number, rate: number, time: number, monthlyPayment: number) {
  // Implementation here
}
```
