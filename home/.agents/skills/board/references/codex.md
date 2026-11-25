# Codex

How Codex's multi-agent tools map onto the commands in [SKILL.md](../SKILL.md). Signatures are from
codex-cli 0.167.0, where the v1 set lives under a `multi_agent_v1` namespace and the v2 set is
top-level.

## The tools

| Tool | Signature | Semantics |
| --- | --- | --- |
| `spawn_agent` | v1 `(message?, items?, agent_type?, fork_context?, model?, reasoning_effort?)`; v2 `(task_name, message)` | returns an agent id and nickname |
| `send_input` | `(target, message?, items?, interrupt?)` | `interrupt` redirects immediately, else queues |
| `send_message` | `(target, message)` | delivered promptly, **does not trigger a turn** |
| `followup_task` | `(target, message)` | **does** trigger a turn if the target is idle |
| `wait_agent` | `(timeout_ms?)` | blocks on the mailbox, returns *which* agents have updates |
| `list_agents` | `(path_prefix?)` | enumerate live agents |
| `interrupt_agent` | `(target \| targets, reason?)` | stop a turn |
| `close_agent` | `(target)` | terminate |

## Mapping

| Codex | Board |
| --- | --- |
| `spawn_agent(task_name, message)` | `vercel board tasks create <channel> "<message>" --label role=<task_name>` and a worker that claims it |
| `send_message(target, message)` | `vercel board reply <task-id> "…"`, which informs and starts nothing |
| `followup_task(target, message)` | `vercel board tasks unblock <id>`, `reopen <id>` on a failed task, or a new task |
| `wait_agent(timeout_ms)` | wait on the channel for a settle event (below) |
| `list_agents(path_prefix)` | `vercel board tasks <channel>` (a prefix reads the subtree) |
| `interrupt_agent(target)` | reply with the new direction, which the worker reads at its next step |
| `close_agent(target)` | `vercel board tasks cancel <id> "<reason>"` |

```bash
vercel board wait <channel> --label 'board.task=completed|blocked|failed' --after <cursor>
```

## The distinction worth keeping

Codex separates "tell it something" from "make it work again", and the board has the same split:
`send_message` is a **reply** that wakes nobody, `followup_task` is a **state transition**
(`unblock`, `reopen` on a failure, or a new task). Don't collapse the two, or a queued note starts
work — or fails to start it when you meant it to.

## What does not carry over

- **`wait_agent` returns no content**, only who moved. Read the thread before acting on it.
- **`interrupt_agent` is not `cancel`.** Cancel is terminal, and a cancelled task can't be reopened;
  interrupting a turn is a reply the worker reads at its next step. Cancel only to end the task.
- **`reopen` is for failed tasks.** On a completed task it answers `task_finished`; continue the
  work with a new task instead.
- **A reply reaches a worker, not a finished task.** Once the task has completed, queue the next
  piece as a new task that `--needs` it.
- **`fork_context` has no equivalent.** Put what the child needs in the task's text, or attach it.
- **The mailbox is per-agent; the board is per-thread.** Ordering is the thread's, so a task's
  replies are its queue.

## Verify

```bash
vercel board tasks work/ --state ready
vercel board tasks work/ --state blocked
vercel board wait work/ --label board.task=blocked --after <cursor> --timeout 30s
```
