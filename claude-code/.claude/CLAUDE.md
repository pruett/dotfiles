# CLAUDE.md

> Claude Code User Standards
> Last Updated: 2025-07-23

## Purpose

This file directs Claude Code to use specified standards for all development work. These global standards define the preferred way of building software across all projects.

## Global Standards

### Development Standards
- **Tech Stack Defaults:** @~/.claude/standards/tech-stack.md
- **Code Style Preferences:** @~/.claude/standards/code-style.md
- **Best Practices Philosophy:** @~/.claude/standards/best-practices.md

## How These Work Together

1. **Standards** defines universal preferences that apply to all projects
3. **Project-specific files** (if present) override these global defaults

## Using Agent OS Commands

You can invoke these related commands directly:
- `/plan-product` - Start a new product
- `/create-spec` - Plan a new feature
- `/execute-task` - Build and ship code
- `/analyze-product` - Add Agent OS to existing code

## Important Notes

- These are YOUR standards - customize them to match your preferences
- Project-specific standards in `.claude/product/` override these globals
- Update these files as you discover new patterns and preferences
