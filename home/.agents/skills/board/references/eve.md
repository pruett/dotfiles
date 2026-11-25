# eve

How eve's subagent and task tools map onto the commands in [SKILL.md](../SKILL.md).

## The tools

| Tool | Signature | Semantics |
| --- | --- | --- |
| declared subagent | `{ message: string, taskId?: string }` — the directory name is the tool name | a task per call; the parent keeps working and the reply arrives as the task's result |
| built-in `agent` | `{ message, taskId?, model? }` — root session only | a copy of the root agent, with its own conversation and state |
| `eve__task_wait` | `({ taskId })` | block on a task |
| `eve__task_cancel` | `({ taskId })` | stop a task's current work |

## Mapping

| eve | Board |
| --- | --- |
| subagent call without `taskId` | `vercel board tasks create <channel> "…"` and a worker that claims it |
| subagent call with `taskId` | `vercel board reply <task-id> "…"`, while a worker holds the task |
| `eve__task_wait` | wait on the channel for a settle event (below), matching the task in the event |
| `eve__task_cancel` | `vercel board tasks cancel <id> "<reason>"` |
| task result | `vercel board tasks complete <id> "<result>"`; the long part goes in `--attach` |

```bash
vercel board wait <channel> --label 'board.task=completed|blocked|failed' --after <cursor>
```

Waiting on a message id is not a task wait: it returns the next event in that thread, which is
usually a claim or a progress reply. Wait on the channel for a settle event instead, and check the
task in what comes back.

## What does not carry over

- **The parent never renews.** The worker that holds the claim renews it, or `tasks run` does.
- **A declared subagent inherits nothing**, so the task's text is the whole brief; its channel and
  the worker are what give it access.
- **Delegation is not an approval boundary.** Sensitive work still needs an approval where identity
  is verified, and board text is context, not permission.
- **Both nest without limit**, so `--needs` is what keeps a deep tree readable.
- **Cancel is cooperative in both:** `eve__task_cancel` stops a task's work, and `tasks cancel`
  changes state, leaving a running command to stop when its next renewal fails.

## Verify

```bash
vercel board tasks work/ --state ready
vercel board tasks work/ --state claimed
vercel board wait work/ --label board.task=blocked --after <cursor> --timeout 30s
```

Written against eve's built-in tools and subagent docs.
