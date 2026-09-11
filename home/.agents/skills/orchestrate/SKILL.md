---
name: orchestrate
description: "[WIP] Break a large mission into a fleet of headless worker agents (claude, codex, or pi), dispatch them in waves, and collect their reports through an on-disk ledger. This session becomes the orchestrator."
argument-hint: "<mission> — what the fleet should find out or change"
disable-model-invocation: true
---

# Orchestrate

> **Work in progress.** This skill is still being built out; commands, ledger schema, and workflow may change without notice.

This session is the **orchestrator**. It breaks the mission down with the user, dispatches **workers**, reads their summaries, and reports. It does not do the work itself.

Workers are headless harness processes (`claude -p`, `codex exec`, `pi -p`) that `orch` spawns, detached from this session. Every fact about the fleet lives in the **ledger** on disk, not in this context. `orch` is the only thing that writes the ledger. It is plain bash + jq, so the orchestrator can be any harness that runs shell commands.

```bash
ORCH="$HOME/.agents/skills/orchestrate/bin/orch"
```

`$ORCH help` lists commands, `$ORCH schema` lists ledger fields, `$ORCH harnesses` shows which worker harnesses are installed and which one hosts this session.

## Steps

1. **Open the run.** `cd` to the parent directory that holds the repos the mission touches (e.g. `~/work/suppco/` over `backend/` and `web/`). If `$ORCH status` already succeeds you are resuming: `$ORCH reap`, then go to step 4. Otherwise `$ORCH init "<mission>"` and `$ORCH harnesses`.
2. **Break it down with the user.** Read only enough to name the tasks (directory listings, top-level docs, the mission text), not enough to answer them. Draft tasks by the rules in *Breaking down a mission*, register each with `$ORCH add`, then show the user `$ORCH status` and stop. The user approves or edits; apply edits with `$ORCH drop <id>` and `$ORCH add`. Nothing spawns until the user says go.
3. **Dispatch a wave.** For each id from `$ORCH next`, up to the concurrency cap: `$ORCH spawn <id> --harness <name> [--model M]`. Then arm one wait: `$ORCH wait --any --timeout 3600`, as a background command that notifies you when it exits. If the host cannot background a command, run it in the foreground with a timeout the host tolerates and re-run it when it exits 124. Never poll faster than that.
4. **Collect.** When the wait returns: `$ORCH reap` files each exited worker's report under `results/<id>.md`, lifts its Summary into the ledger, and marks it done or failed. Then `$ORCH next`: if it lists tasks, go to step 3. If workers are still running, re-arm the wait. A failed task's summary carries its exit code and stderr tail: fix the prompt or bound and `$ORCH add` it again under a new id.
5. **Kill** a worker that is stale, redundant, or off-scope (see *Killing*). Kill before you re-plan.
6. **Synthesize.** When `$ORCH next` and `$ORCH running` are both empty: add one `verify` task with `--cwd "$($ORCH path run)"`, prompt "read every results/*.md and reconcile them into one answer to the mission; name disagreements", `--depends-on` every other task. Spawn it, wait, reap. Read no result file yourself.
7. **Report.** Give the user `$ORCH status` and the synthesizer's summary line, then `$ORCH finish`. Depth stays in `results/`.

## Breaking down a mission

- **One task is one question or one change**, scoped to one directory, finishable in one worker session. If you cannot write its bound in one sentence, split it.
- **Kinds.** `research` answers a question read-only. `change` edits files, commits nothing. `verify` checks a claim or reconciles other reports, read-only.
- **Research before change.** A change task depends on the research task that tells it where to cut. Verify tasks depend on the change they check.
- **Same repo, one editor at a time.** Two `change` tasks in the same repo run serially via `--depends-on`.
- **Self-contained prompts.** The worker has none of this conversation. Put every fact it needs in the task body: file paths you already know, the acceptance criterion, what not to touch. `orch` adds only the mission, cwd, mode, bound, and report format.
- **Bound is a stop condition**, e.g. "the first confirmed answer with file:line evidence", "tests in spec/models pass, or 3 attempts".
- **Size.** 3–8 tasks per wave is typical. Past ~15 tasks total, propose splitting the mission into two runs.
- **Ids** are short kebab-case with a repo prefix: `be-credits-model`, `web-cart-drawer`.

## Choosing a harness and model

Default to the host harness (`$ORCH harnesses` marks it) so workers share its auth and profile. Choose `codex` when OS-enforced read-only or workspace-write sandboxing matters. `pi` has no sandbox flag: read-only is prompt-enforced only. Use a small model for lookups and inventories, the harness default for changes and synthesis. Adapters live in `harnesses.json`; edit that file to add a harness or change its flags.

## Token discipline

The orchestrator's context is the scarce resource. Workers are cheap; re-reading is expensive.

- `$ORCH status` is the whole view of the fleet. Open a result file only for a specific question, with `grep` or `sed -n`, never `cat`.
- Concurrency cap: 4 workers unless the user raises it.
- After a context compaction or a new session, recover from disk: `$ORCH status`, then `$ORCH reap`. A worker whose process is gone is reaped as failed automatically.

## Killing

Kill when a worker is **stale** (running past its bound plus 10 minutes), **redundant** (another task already answered its question), or **off-scope** (`tail workers/<id>.out` shows work outside its cwd or kind).

`$ORCH kill <id> --reason "<why>"` kills the process tree and keeps any partial report. If the question still matters, `$ORCH add` it again under a new id with a tighter bound.

## Layout

```
<root>/.orchestrator/
  current -> runs/<run_id>          # what `orch` resolves from any subdirectory
  runs/<run_id>/
    ledger.json                     # the fleet; orchestrator-only writes, atomic
    workers/<id>.task.md            # the task body you wrote
    workers/<id>.prompt.md          # the full prompt the worker received
    workers/<id>.{out,err,exit}     # raw output and exit code
    results/<id>.md                 # one report per task
```

Add `.orchestrator/` to the root's ignore file when the root is a git repo.
