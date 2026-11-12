# Principles

These are pstack's engineering principles. Each one's full text is `~/.agents/skills/principle-<name>/SKILL.md`; the line here is only its trigger, so read the full file the first time a decision turns on it.

## How a lead runs the project

- **prove-it-works**: accept a chunk only on the real artifact (the running feature, the actual value, the diff), never a worker's summary, green CI alone, or "it compiles".
- **sequence-verifiable-units**: every chunk and PR ends in a state you can check before the next starts; stack PRs so the sequence proves itself.
- **separate-before-serializing-shared-state**: two chunks that would write the same file, branch or state get split until they don't, before you reach for ordering.
- **attack-the-premise**: two fix rounds that share one premise failed the same check: write the premise down and give a worker the job of testing it before any third fix.
- **fix-root-causes**: a bug chunk is done when the first place the system went wrong is fixed, not when the symptom is guarded.
- **build-the-lever**: work repeated across many sites gets a chunk that builds the codemod, script or check first; the other chunks run it.
- **laziness-protocol** and **subtract-before-you-add**: prefer the smallest diff that meets the goal; a cleanup that removes dead weight goes before the feature that builds on it.
- **experience-first**: in a recommendation, choose what the user would notice over what is convenient to build.
- **explain-the-number**: a measured number (speedup, regression, eval score) goes up only with what limits it and why it measures what you claim.
- **never-block-on-the-human**: reversible work proceeds; the CoS gets real decisions, each with your recommendation.
- **guard-the-context-window**: workers read the bulk and report summaries or file paths; your context holds the plan.
- **encode-lessons-in-structure**: a correction you give workers twice becomes a check, lint or script a chunk builds, not a longer brief.

## What to name in a brief

Workers read principles by file, since each is a slash-only skill: name them in PRINCIPLES as `~/.agents/skills/principle-<name>/SKILL.md`. Pick from the rows the chunk matches; three or four is typical, and a chunk that matches no row gets none.

| The chunk | Principles to name |
|---|---|
| any code change | prove-it-works, laziness-protocol, minimize-reader-load |
| new types, data structures, or the core of a feature | foundational-thinking, model-the-domain, type-system-discipline |
| a new requirement in an existing design | redesign-from-first-principles, subtract-before-you-add |
| validation, error handling, framework adapters | boundary-discipline |
| commands, lifecycle steps, loops that may rerun after a crash | make-operations-idempotent |
| a new internal API with old callers | migrate-callers-then-delete-legacy-apis, outcome-oriented-execution |
| a migration, sweep, or run of similar edits | build-the-lever, sequence-verifiable-units |
| debugging | fix-root-causes, attack-the-premise |
| writing or changing tests | test-behavior-not-implementation |
| measuring performance or an eval | explain-the-number |
| a novel interaction or architecture with no precedent | exhaust-the-design-space, experience-first |
| a reviewer | the same principles its implementer was given |
