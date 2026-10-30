# Herdr gotchas

Verified while running fan-outs (2026-10-06 → 10-21). Check `herdr agent --help` when one stops matching.
- `herdr agent send-keys` takes KEY NAMES one per arg (`/ r e p o`, `enter`, `esc`, `space`, `ctrl-c`). A multi-char string like "/quit" is silently dropped. `herdr agent prompt` types text AND submits.
- Codex `-s read-only` cannot write anywhere, and `-s workspace-write` only writes under the tab's cwd. Research agents that must save a deliverable need cwd = where the file goes, or write inside the repo and move it. `codex resume <session-id> -s workspace-write` recovers a finished read-only session; kill the old process first (`/quit` via send-keys doesn't work).
- Codex MCP calls (e.g. figma `use_figma`) need `--ask-for-approval on-request`; default policy "never" rejects them with "MCP tool call requires approval".
- Devin Cloud: run `/repo` (space to toggle, enter to confirm) BEFORE any prompt. A stray message creates a pending session and `/repo` then fails with "no org_id set for pending session"; only a fresh `devin --cloud` fixes it.
- Claude tabs started with CLAUDE_CONFIG_DIR=~/.claude-work load all claude.ai connectors by default. Figma is among them since 2026-10-20 (mcp__claude_ai_Figma__*, verified get_design_context in ss-figma-fix); before that it was Codex-only. Mixpanel and Linear are.
- Claude research tabs started with `--permission-mode acceptEdits` still stop on every Bash prompt (`gh`, IFS loops); `herdr agent wait` returns immediately on `blocked`. Answer the prompt with send-keys `2` ("switch to auto mode") once, then re-wait. (2026-10-08)
- Devin CLI header showed "Teams · 0% remaining" on 2026-10-08 but a cloud session still accepted the prompt.
- Devin Cloud auto-monitors its PR ("I'll fix CI failures and address comments") and fixes Bugbot/Seer threads itself, often before guidance you send lands. Check the thread + commit before sending a fix; if a draft is queued behind a running turn, discard it with send-keys `up` then `backspace` in batches of ~40 (a single call with 1300 keys silently fails; `ctrl-c` is an unsupported key name).
- `herdr agent wait` in a background Bash plus `herdr agent read --source recent-unwrapped` is the collection loop; `--source screen` is not a valid source.
- A tab whose cwd is `$HOME` (or any folder not trusted yet) starts at Claude Code's trust-this-folder prompt and `agent start` returns `agent_not_ready`: `send-keys <id> down enter`, then `agent wait`. Prefer a repo or worktree cwd. (2026-10-21)

## Mac app (herdr-core, `hc`) — verified 2026-10-30

- `hc run` does not pass the caller's environment to the terminal (`CLAUDE_CONFIG_DIR` came through empty) and has no `--env` flag. Prefix the command with `env VAR=val`.
- `hc run --label herdr.space=<id>` opens a new tab in that space without stealing focus. The tab is named by its number, so rename it with `herdr-app do tab.rename`. `herdr-app do tab.new` focuses the new tab and cannot set the environment, so don't use it for fan-out.
- Terminals started with `hc run` are children of the caller and die with it by default. Pass `--outlive-parent` to keep them running.
- `hc keys` takes key names one per argument, like `herdr agent send-keys`: `hc keys <t> down enter`.
