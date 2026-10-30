# Agent gotchas

Verified while running fan-outs (2026-10-06 → 10-30). Read the sections for the agent kinds and Herdr CLI you dispatch with. Check `--help` when one stops matching.

## Sending keys

- `herdr agent send-keys` and `hc keys` take KEY NAMES one per arg (`/ r e p o`, `enter`, `esc`, `space`, `down`). A multi-char string like "/quit" is silently dropped. `herdr agent prompt` types text AND submits.

## Claude

- A tab whose cwd is `$HOME` (or any folder not trusted yet) starts at the trust-this-folder prompt and `agent start` returns `agent_not_ready`: `send-keys <id> down enter`, then `agent wait`. Prefer a repo or worktree cwd.
- `--permission-mode acceptEdits` still stops on every Bash prompt (`gh`, IFS loops), and `agent wait` returns at once on `blocked`. Answer with send-keys `2` ("switch to auto mode") once, then re-wait.

## Codex

- `-s read-only` cannot write anywhere; `-s workspace-write` only writes under the tab's cwd. A research agent that saves a deliverable needs cwd = where the file goes. `codex resume <session-id> -s workspace-write` recovers a finished read-only session; kill the old process first.
- MCP calls (e.g. figma `use_figma`) need `--ask-for-approval on-request`; the default "never" rejects them with "MCP tool call requires approval".

## Devin Cloud

- A message sent before `/repo` creates a pending session, and `/repo` then fails with "no org_id set for pending session"; only a fresh `devin --cloud` fixes it.
- It monitors its own PR and fixes CI and review threads itself, often before your guidance lands. Check the thread and commits before sending a fix. To discard a draft queued behind a running turn, send `up` then `backspace` in batches of ~40 keys (one call with 1300 keys silently fails).

## Mac app (`hc`)

- `hc run` does not pass the caller's environment and has no `--env` flag. Prefix the command with `env VAR=val`.
- `hc run --label herdr.space=<id>` opens a tab in that space without stealing focus; rename it with `herdr-app do tab.rename`. Don't fan out with `herdr-app do tab.new`: it steals focus and cannot set the environment.
- Terminals started with `hc run` die with the caller unless you pass `--outlive-parent`.
