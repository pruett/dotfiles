# Review: an adversarial verdict, no edits

Read `~/.agents/skills/interrogate/SKILL.md` and follow it, with one change to its step 3: the reviewers come from two model families.

- **Herdr** (`HERDR_ENV=1`): Reviewer A is Opus 5.5 (Claude) and Reviewer B is GPT-6 Luna (Codex, `-s read-only`), dispatched and collected with the commands in `~/.agents/skills/orchestrate/SKILL.md` and rows from its `references/models.md`. Skip orchestrate's chunking and approval. Send each the filled `interrogate/references/reviewer-prompt.md`.
- **No Herdr:** two `general-purpose` subagents (`model: "opus"` and `model: "fable"`), and say in the verdict that both reviewers are Claude.

Done when the interrogate output format is filled. Apply nothing; an accepted finding becomes a fix only when the user says so.
