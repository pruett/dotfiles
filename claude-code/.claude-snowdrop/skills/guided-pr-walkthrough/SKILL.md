---
name: guided-pr-walkthrough
description: Write a guided walkthrough into a GitHub PR body — a plain-language tour of the diff anchored on its primitives (database records, schema shapes, payloads, message flows). Use after a PR is submitted, or when asked to walk through or explain a PR.
---

# Guided PR walkthrough

Turn the PR's diff into a walkthrough a teammate can absorb in two minutes, then write it into the PR body.

## Gather

`gh pr view <n> --json url,title,body` and `gh pr diff <n>`. Read enough surrounding code to say what each change does to the system, not just which lines moved.

## Find the primitives

The walkthrough hangs on the primitives the PR adds, reshapes, or deletes: database records, schema shapes, payloads, and the message passing between entities. List every one. Everything else — refactors, plumbing, tests — is supporting detail worth one line at most.

## Write it

Plain language: short sentences a reader outside this codebase could follow. Talk in ASD-STE100 Simplified Technical English, and use any ubiquitous language captured in CONTEXT.md. For each primitive:

- One sentence — what it was, what it is now, what that changes for the system.
- A trimmed snippet (≤10 lines, `...` elides the rest) showing the shape — before/after when the shape changed.

Where entities exchange messages, draw the exchange as a mermaid sequence diagram instead of prose.

Order by leverage: the change a reader must understand first goes first.

## Update the PR Description

Update the PR's desription with a `## Guided walkthrough` heading in the PR description body — replace any prior one, keep the rest of the body — via `gh pr edit <n> --body-file`.

Done when every changed primitive appears with a snippet or diagram and the PR body carries the walkthrough.
