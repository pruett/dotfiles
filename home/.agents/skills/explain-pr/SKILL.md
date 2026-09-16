---
name: explain-pr
description: Explain a PR or diff as a short brief a reviewer can read instead of the diff. Ranks changes by leverage, shows the shape change visually, and grounds each concept in a real example from the code.
argument-hint: "<PR number | PR URL | branch | ref range>  [--html]"
disable-model-invocation: true
---

# Explain PR

Produce a **brief**: the shortest document that lets the reader skip the raw diff and still review it well. The brief spends the reader's attention on the few **high-leverage** changes and accounts for everything else in one line each. Read it in under three minutes.

Visuals follow the vocabulary in `~/.agents/skills/show-me/SKILL.md` (diff-shaped call trees, component trees, sequence diagrams, one focused HTML page). Load it before step 4.

## Steps

1. **Pin the diff.** Resolve the argument to a base and head, then capture the change set once:
   - PR number or URL: `gh pr view <n> --json title,body,baseRefName,headRefName,commits,url` and `gh pr diff <n>`. Fetch any issue the body links.
   - Branch or nothing: `git diff $(git merge-base main HEAD)...HEAD`; three-dot so the comparison is against the merge-base. Use the repo's default branch if it is not `main`.
   - Explicit range (`a..b`, `a...b`): use as given.

   Also capture `git diff --stat` and `git log --oneline` over the same range. Done when the diff is non-empty and you hold title, description, commit list, stat, and full diff.

2. **Bucket every file by leverage.** Leverage is how much the change moves behaviour, contracts, or the reader's mental model per line read. Assign each file in the stat to exactly one bucket:
   - **High**: changes a contract (type, API signature, schema, route, public prop, config shape), changes behaviour on a shared or hot path, introduces a new concept the reader must learn (a new module, state, term, or invariant), or is where a bug would hide (concurrency, caching, auth, money, migrations).
   - **Fan-out of \<high change\>**: mechanical consequences of a high change (call sites updated, imports, renamed references, tests that mirror the new contract). Name the parent.
   - **Noise**: formatting, moves without edits, lockfiles, generated code, copy tweaks, snapshot churn.

   Keep at most **five** high items; if more qualify, merge the ones that serve a single purpose and rank by blast radius. Done when every file in the stat sits in one bucket and each high item has a one-line name.

3. **Find the spine.** One sentence stating what the PR really does and why, in the product's own terms. Test it against the title, the description, and the high bucket; when they disagree, the diff wins and the brief says so. Then list every **new concept** a reader must learn (a new type, state, term, or rule). Done when you can name each concept and point to the line that introduces it.

4. **Ground each high item.** For every high change, read enough surrounding code (not just the hunk) to state, with `file:line` pointers:
   - **What changed** in one sentence.
   - **Why it matters** in one sentence: what breaks or becomes possible.
   - **A worked example**: a concrete input to output, or a before/after snippet of at most ten lines, using real identifiers and values from the code. An example you had to invent means you have not understood the change yet; keep reading.
   - **Where a reviewer should look**: the one risk or assumption worth verifying.

   Done when every high item has all four parts and every example is traceable to a line in the diff.

5. **Write the brief** in this order, prose kept to what the visuals do not already say:
   1. **Spine**: the one sentence from step 3, plus the size line (`N files, +a/-b, k commits`).
   2. **Shape**: one visual of before → after. Pick the smallest view from `show-me` that shows the mechanism: a diff-shaped call tree for control flow, a component tree for UI, a sequence diagram for a protocol change, a state diagram for a lifecycle change. Show only the nodes the high items touch.
   3. **High-leverage changes**, ranked, each with the four parts from step 4.
   4. **Concepts**: each new concept in at most two sentences plus its example. Skip the section when there are none.
   5. **Everything else**: one line per fan-out group and one line for noise, with file counts, so the reader trusts nothing was hidden.
   6. **Review checklist**: three to five checkable questions drawn from the "where to look" notes.

   Default output is Markdown in the conversation. With `--html`, or when the shape change is too dense for Mermaid, write one HTML page per `show-me`'s HTML rule to `.scratch/explain-pr-<branch>.html` and `open` it.

   Done when the brief fits the three-minute budget: about 400 words of prose outside code blocks and visuals. Over budget means a high item belongs in fan-out or a concept is being re-explained.

## Large diffs

Past roughly 1500 changed lines, or more than 40 files, fan the reading out: one read-only sub-agent per top-level directory or package, each given the diff for its slice and steps 2 and 4 verbatim, returning its buckets and grounded high items in under 300 words. Merge their high buckets, re-rank against the five-item cap, then continue at step 3 yourself. The spine and the brief are always written by the session that holds the whole picture.

## Grounding

Every claim in the brief traces to a line in the diff or in the surrounding code you read. When the PR description promises behaviour the diff does not contain, or the diff contains behaviour the description omits, say so in the spine: that gap is itself high-leverage.
