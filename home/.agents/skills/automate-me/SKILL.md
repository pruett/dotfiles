---
name: automate-me
description: Turn the user's working style into a personal skill (`<handle>-mode`) by mining their past Claude Code and Codex chats and asking a few questions. Type /automate-me.
disable-model-invocation: true
---

# Automate me

Writes or updates one skill, `~/.agents/skills/<handle>-mode/SKILL.md`, that captures how the user likes agents to work. Adapted from pstack's `automate-me`. The engineering process itself lives in the **mode** skill; this skill captures the user's own preferences on top of it.

Use it for working style across tasks. One narrow workflow ("how I write commit messages") is a regular skill instead; a look back at one session is **retro**.

## 1. Find an existing skill

Look for `~/.agents/skills/*-mode/SKILL.md` other than `mode` itself. If one exists, update it in place unless the user asked to start fresh:

- Mine only history since its last commit (`git -C ~/.dotfiles log -1 --format=%cI -- <path>`).
- Ask what changed or is missing, not what to capture from zero.
- Keep sections the new evidence does not contradict.

Done when you know the handle, the target path, and whether this is a new skill or an update.

## 2. Mine the history

The corpus is the user's own chats on this machine:

- Claude Code: `~/.claude/projects/*/*.jsonl`, one file per session; subagent transcripts sit in `<session>/subagents/`, so skip them.
- Codex: `~/.codex/sessions/<yyyy>/<mm>/<dd>/*.jsonl`.

Default to the last 4 weeks across every project; narrow to the projects the user names. Order files by modification time, never by name.

Split the window into 3 slices and give each to a parallel subagent with this brief: read the user's own messages (the corrections and repeated requests matter most), and return a short list of patterns, each with 2-3 evidence pointers (file and a quoted line). Signals to hunt:

- Response preferences: length, tone, format, "simpler" corrections.
- Autonomy: what they let agents do unasked, what they want asked first.
- Delegation: subagents, models, parallel agents, tools like `orchestrate` or `fleet`.
- Verification: what "done" means to them.
- Code and prose discipline: style rules, principles they cite.
- Process: worktrees, commits, PRs, review and merge habits.
- Skills: when they fix or add skills.

Keep a pattern only when 2+ slices show it. Done when every slice has reported and the cross-checked list is ready.

## 3. Ask the user

Mining misses intent that has not come up yet. Ask one or two multiple-choice questions (the harness's question tool, else plain text), 4-6 options each, multi-select: first which areas matter most, then specifics within the chosen areas. Close with one free-form question for anything the options missed.

## 4. Compare with what already exists

Read `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` if present, and the **mode** skill. A rule already written there stays there; the new skill points to it instead of repeating it. Done when each surviving pattern is marked new, already covered, or contradicting an existing rule (ask the user which wins).

## 5. Write the skill

Load the **writing-for-agents** skill and follow it. Then:

- Path: `~/.dotfiles/home/.agents/skills/<handle>-mode/SKILL.md` (it appears at `~/.agents/skills/` through the dotfiles link).
- Frontmatter: `name: <handle>-mode`, a one-line human-facing `description`, `disable-model-invocation: true` unless the user wants it on every turn.
- Sections only where the user has a specific, non-default rule: response style, autonomy, delegation, verification, code and prose, process, skills. "Communicate clearly" is not a rule; "tables when comparing options" is.
- Write "the user", not their name, in imperatives. Point to other skills by name instead of pasting their content.

Apply the **unslop** skill to every line, then show the draft and take feedback. Expect a few rounds; cut hard.

## 6. Land it

Run `skills sync` so Claude Code sees it. Commit in `~/.dotfiles` once the user approves the draft.
