# Tech Stack

> Version: 1.0.0
> Last Updated: 2025-07-23

## Context

This file is part of the Agent OS standards system. These global tech stack defaults are referenced by all product codebases when initializing new projects. Individual projects may override these choices in their `.agent-os/product/tech-stack.md` file.

## Core Technologies

### Application Framework
- **Framework:** Next.js with App Router
- **Version:** 15+
- **Language:** TypeScript

### AI
- **Framework:** AI SDK
- **Version:** v5 or Latest
- **Language:** TypeScript
- **Reference:** [AI SDK Documentation](https://v5.ai-sdk.dev)

### Database
- **Primary:** PostgreSQL
- **Version:** 17+
- **ORM:** Drizzle ORM

### Authentication
- **Libary**: better-auth with PostgreSQL adapter
- **Flow**
  - better-auth handles authentication with OAuth providers (Google, GitHub)
  - PostgreSQL database stores user sessions and authentication data
  - Protected routes use better-auth session validation
  - Authentication state management integrated with Next.js App Router

### Payment
- **Service**: Stripe via better-auth Stripe plugin

### Import Strategy
- **Strategy:** ESM
- **Package Manager:** pnpm
- **Node Version:** 22 LTS

### CSS Framework
- **Framework:** TailwindCSS
- **Version:** 4.0+
- **PostCSS:** Yes

### UI Components
- **Library:** shadcn/ui
- **Version:** Latest
- **Installation:** pnpm dlx shadcn@latest init

### Icons
- **Library:** Lucide
- **Implementation:** React components

## Available Commands

```bash
# Development
pnpm dev                   # Start development server
pnpm build                 # Build for production
pnpm start                 # Start production server

# Code Quality
pnpm lint                  # Run ESLint
pnpm lint:fix              # Fix ESLint issues automatically
pnpm type-check            # Run TypeScript type checking

# Package Management
pnpm install               # Install dependencies
pnpm add <package>         # Add new dependency
pnpm add -D <package>      # Add dev dependency

# Use pnpm dlx as an alternative to npx
pnpm dlx <command>         # Run commands using pnpm instead of npx

# shadcn/ui component management
pnpm dlx shadcn@latest add # Add new shadcn/ui components

# Database Managment (via Drizzle Kit )
pnpm drizzle-kit push       # Push database migrations
pnpm drizzle-kit studio     # Start Drizzle Studio database UI

# Auth-related database migrations
pnpm dlx @better-auth/cli@latest generate  # Generate database schema changes
```
