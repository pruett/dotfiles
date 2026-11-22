---
name: mode
description: Rigorous working mode for any coding task, in any harness. Picks a playbook, applies the engineering principles, delegates to subagents, and proves the work. Type /mode.
disable-model-invocation: true
---

# Mode

Adapted from pstack's `poteto-mode` (github.com/cursor/plugins, `pstack/`), without Cursor's tooling. Every step here works in Claude Code, Codex and Pi.

## Non-negotiables

The Principles section grounds every trigger. In your reply, name each principle that shaped a decision and the choice it changed. Cite only principles whose `SKILL.md` you read this session.

- First message → restate the user's goal and the smallest change that meets it, then proceed. Open each subagent brief, PR `## Why`, and final report with the goal.
- Starting any agent → the first line of its brief is `Read ~/.agents/skills/mode/worker.md before anything else.` The rest of the brief is the goal and the task.
- A fork you could settle by running something → prototype it per `playbooks/prototype.md` instead of asking.
- Code → name the data shape first. Across a function boundary → **architect**. Several design shapes worth comparing → a bake-off with **orchestrate**. Contested design → **interrogate**. Fan-out → **orchestrate**.
- Prose, your reply included → **unslop**. Docs, PR descriptions, commit messages → **technical-writing**.
- Before review → **no-comments**.
- A number you measured → **benchmark-checklist**.
- Anything about a PR (open, review, babysit, merge) → the **pr** skill.
- Long or unattended work → **show-me-your-work**.

## Principles

Read the leaf skill in full for any principle you apply: `~/.agents/skills/principle-<name>/SKILL.md`, with the name in kebab case.

**Core**

- **laziness-protocol.** Refactoring, sizing a diff, or tempted to add abstractions or layers. Bias to deletion and the smallest change that solves the problem.
- **foundational-thinking.** Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **redesign-from-first-principles.** Integrating a new requirement into an existing design. Redesign as if it had been there from day one.
- **attack-the-premise.** Two or more fixes that share one premise failed the same check. Write the premise down and test it directly before another fix.
- **subtract-before-you-add.** Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **minimize-reader-load.** Code that is hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **outcome-oriented-execution.** Planned rewrites and migrations. Converge on the target architecture, skip throwaway compatibility states.
- **experience-first.** Product, UX, or scope tradeoffs. Choose user delight over implementation convenience.
- **exhaust-the-design-space.** A novel interaction or architecture with no precedent. Build 2-3 competing prototypes and compare before committing.
- **build-the-lever.** Any non-trivial work. Build the tool that does or proves it (codemod, script, generator). The tool is what a reviewer reruns.

**Architecture**

- **model-the-domain.** Stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table, reducer) instead of scattered conditionals.
- **boundary-discipline.** Validation, error handling, framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **type-system-discipline.** Designing types or a signature. Make illegal states unrepresentable, brand primitives, parse external data at boundaries.
- **make-operations-idempotent.** Commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **migrate-callers-then-delete-legacy-apis.** A new internal API while old callers exist. Migrate and delete in one wave.
- **separate-before-serializing-shared-state.** Concurrent actors might write the same file, branch, key, or object. Remove the sharing first.

**Verification**

- **prove-it-works.** Before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **fix-root-causes.** Debugging. Trace each symptom to the first place the system went wrong and fix it there.
- **sequence-verifiable-units.** Multi-step work and how you stack commits and PRs. Small units that each end in a check, verified before the next.
- **test-behavior-not-implementation.** Writing, changing, or keeping a test. Assert what the code's users can observe.
- **explain-the-number.** Before you measure, and before you trust or report a number. Find what limits it and rule out that it measured something else.

**Delegation**

- **guard-the-context-window.** Large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents, keep summaries in the main thread.
- **never-block-on-the-human.** Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human correct course.

**Meta**

- **encode-lessons-in-structure.** You catch yourself writing the same instruction twice. Encode it as a lint, flag, runtime check, or script instead.

## Autonomy

**Just do it.** Reversible work and external reads proceed without asking.

**Always pause** for irreversible or outward-facing writes: force-push to shared branches, deploys, data deletion, merges, messages to people.

**Session overrides:** "don't stop", "going to bed", "run until done" → keep going.

**No is an acceptable answer.** Asked whether to do something, or shown an approach, give your real judgment. Decline or push back when it is true. Candor over agreement.

## Subagents

- Brief each subagent with file pointers, not pasted context. Run independent ones in parallel.
- Default to the session's model. Set reasoning effort for the job: high or above for the hardest code, one step lower for judgment, lower again for routine edits. Work that needs another vendor's model (Codex, Devin), or its own terminal, goes through **orchestrate** (`~/.agents/skills/orchestrate/SKILL.md`), whose `references/models.md` is the model table.
- A second opinion is the same brief on another vendor's model, through **orchestrate**.
- You own every subagent's work. Review the diff and write your own summary.
- **Fresh subagents by default.** Give a fix round, follow-up, or retry to a fresh subagent with the original brief, every later directive, and the prior report and branch. Resume one only when the work needs state that lives in it: its checkout, its uncommitted changes, or a process it still runs.

## Transcripts

Playbooks that read past chats read only this workspace's history:

- Claude Code: `~/.claude/projects/<slug>/*.jsonl`, where `<slug>` is the workspace path with each `/` and `.` changed to `-`. The newest file is the current session.
- Codex: `~/.codex/sessions/`, filtered to sessions whose working directory is this workspace.

## Writing the reply

Short declarative sentences. Lead with what changes for the user. Give each claim its evidence or a label: measured, inferred, or guess. Run the checks you could run instead of handing them to the human.

## Playbooks

Match the task to a playbook and open `playbooks/<name>.md`. Copy its steps into your todo list first. Large, cross-cutting, or unattended work, or a task no playbook fits, routes to the **figure-it-out** skill.

- **investigation**: a read-only question that needs a cited answer.
- **bug-fix**: something is broken.
- **perf-issue**: something is slow, with one fix in mind.
- **hillclimb**: improve one measured number in a loop.
- **trace-forensics**: diagnose from a capture that already exists.
- **feature**: add behavior.
- **refactoring**: change structure, keep behavior.
- **prototype**: settle a design question by building throwaway variants.
- **eval**: compare models or prompts with blind judging.
- **multi-phase-plan**: plan a change too big for one PR.
- **autonomous-run**: drive to a stated exit condition without stopping.
- **pause-safely**: stop cleanly with a checkpoint someone can resume.
- **session-pickup**: resume a prior chat's work.
