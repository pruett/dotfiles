# Interrogation Guide

Systematic question categories for extracting component requirements from users.
Ask questions in priority order. Skip categories already well-covered by the
architecture doc. Batch 2-4 questions per message to avoid overwhelming the user.

## Priority 1 — Purpose & Boundaries

- What problem does this component solve? What happens if it doesn't exist?
- What is explicitly OUT of scope for this component?
- Who or what are the consumers of this component? (users, other services, cron jobs, etc.)
- What is the component's lifecycle? (always running, on-demand, scheduled, event-driven)

## Priority 2 — Interfaces & Data

- What are the inputs? (API requests, messages, files, user actions, events)
  - For each input: format, schema, source, volume, frequency
- What are the outputs? (responses, side effects, events emitted, files written)
  - For each output: format, destination, latency expectations
- What external systems does it depend on? (databases, APIs, queues, caches)
  - For each dependency: what happens when it's unavailable?
- What data does the component own vs. borrow?
  - Owned: stored and managed by this component
  - Borrowed: read from or passed through from elsewhere

## Priority 3 — Behavior & Rules

- Walk through the primary happy path step by step. What triggers it and what's the end state?
- Are there secondary workflows? (batch processing, admin operations, migrations)
- What are the business rules / invariants that must ALWAYS hold?
  - Example: "A user can never have two active subscriptions simultaneously"
- What state transitions exist? Draw them out if possible.
- Are there ordering or sequencing constraints? (must X happen before Y?)

## Priority 4 — Failure & Edge Cases

- What are the known failure modes? How should each be handled?
- What are the retry/recovery semantics? (at-least-once, exactly-once, best-effort)
- What happens during partial failures? (half-written data, interrupted workflows)
- What are the concurrency concerns? (race conditions, deadlocks, duplicate processing)
- What inputs are invalid? How should they be rejected?

## Priority 5 — Quality Attributes

- Performance: target latency, throughput, resource budget?
- Reliability: uptime target, acceptable data loss window?
- Security: authentication, authorization, encryption, audit requirements?
- Scalability: expected growth, scaling strategy (horizontal/vertical)?
- Observability: what metrics, logs, and traces are needed?

## Priority 6 — Validation & Acceptance

- How do you know this component is working correctly?
- What are the critical test scenarios? (the ones that, if failing, mean the system is broken)
- Are there integration checkpoints? (health checks, smoke tests, contract tests)
- What does a production rollout look like? (feature flags, canary, blue-green)
- What monitoring/alerting is needed post-deploy?

## Interrogation Technique

- **Start broad, then drill down.** Ask about purpose before implementation details.
- **Use "what if" scenarios.** "What if the database is down?" reveals failure handling.
  "What if two users do X at the same time?" reveals concurrency needs.
- **Ask for examples.** "Can you give me a concrete example of [behavior]?" turns
  abstract requirements into testable scenarios.
- **Challenge assumptions.** "You said it should be fast — what does fast mean? 100ms? 1s? 10s?"
- **Reflect back.** Summarize what you've learned after each round and ask the user
  to confirm or correct. This catches misunderstandings early.
- **Know when to stop.** When answers start repeating or the user says "that covers it,"
  move on. Don't interrogate for the sake of interrogating.
