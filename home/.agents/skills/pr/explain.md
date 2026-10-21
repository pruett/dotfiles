# Explain: the moving parts of a PR

Give the reader a map of a large change: a short numbered list of its **moving parts**, each named in a few words and summarised in one sentence. The reader asks follow-ups to dig into any part.

1. **Read the whole change.** Resolve each argument to a diff:
   - PR number or URL: `gh pr view <n> --json title,body,files,url` and `gh pr diff <n>`.
   - Branch or nothing: `git diff $(git merge-base main HEAD)...HEAD`.
   - Range: use as given.

   With several arguments (a backend PR and a web PR), read them all; the list covers the workstream, not one repo. Read enough surrounding code to know what each changed function does. Done when every changed file is accounted for by some part.

2. **Group by responsibility, not by file.** A moving part is one job the change does ("polling loop", "off switch"), and it may span many files. Aim for 6–10 parts; fold mechanical fan-out (call sites, imports, type updates) into the part it serves. Tests and docs share one final part.

3. **Order core first.** The parts on the feature's main path come first, in runtime order, then the parts that keep it safe, then supporting parts.

4. **Write the list.**
   - Each item: **bold name** (2–4 plain words), then one sentence saying what it does, for a product engineer new to the code.
   - HTTP methods and paths, real function and file names, plain verbs. Only terms the code or product already uses.
   - Close with one sentence naming which parts are the core and which support it.

   Done when every item is one sentence and the list reads in under a minute.

Stop after the list.
