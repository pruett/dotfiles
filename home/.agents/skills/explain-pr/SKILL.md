---
name: explain-pr
description: List the major moving parts of a large PR or workstream as plain-language categories, one sentence each.
argument-hint: "<PR number | PR URL | branch | ref range> [more PRs…]"
disable-model-invocation: true
---

# Explain PR

Give the reader a high-level mental model of a large change: a short numbered list of its **moving parts**, each named in a few words and summarised in one sentence. The reader uses it as a map and asks follow-ups to dig into any part.

## Steps

1. **Read the whole change.** Resolve each argument to a diff:
   - PR number or URL: `gh pr view <n> --json title,body,files,url` and `gh pr diff <n>`.
   - Branch or nothing: `git diff $(git merge-base main HEAD)...HEAD`.
   - Range: use as given.

   With several arguments (e.g. a backend PR and a web PR), read them all; the list covers the workstream, not one repo. Read enough surrounding code to know what each changed function does. Done when every changed file is accounted for by some part.

2. **Group by responsibility, not by file.** A moving part is one job the change does (e.g. "polling loop", "off switch", "start and stop"), and it may span many files. One file may feed several parts. Aim for 6–10 parts; fold mechanical fan-out (call sites, imports, type updates) into the part it serves. Tests and docs share one final part.

3. **Order core first.** Put the parts that make up the feature's main path first, in the order they happen at runtime, then the parts that keep it safe, then supporting parts.

4. **Write the list.**
   - Each item: **bold name** (2–4 plain words), then one sentence saying what it does, in terms a product engineer new to the code understands.
   - Use HTTP methods and paths, real function and file names, and plain verbs. Use only terms the code or product already uses; define none of your own.
   - Close with one sentence naming which parts are the core and which support it.

   Done when every item is one sentence and the whole list reads in under a minute.

Stop after the list. The reader will ask for detail on the parts they care about.
