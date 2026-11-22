# Race

Several agents get the same brief and you keep one result, or every agent checks one slice of a whole and you merge the results. Adapted from pstack's `swarm`; pstack skills that say "the swarm skill" mean this file.

## Frame

1. State the done condition and what the race returns.
2. Choose the shape:
   - **coverage**: split a check across slices (files, platforms, commits); every slice needs a result.
   - **race**: N agents on one brief. Declare the selection rule before dispatch: `first pass`, `rank all`, or `best-of`.
3. Pick models from [`models.md`](models.md). A model race names each arm's model up front; otherwise use the Workhorse class.
4. A worker that writes gets its own worktree. A worker that verifies or measures commits gets the exact SHAs; a measurement brief also names the method (sample count, what one sample is, order).

## Fan out

Dispatch every worker per steps 6-7 of the orchestrate skill, or as parallel subagents when `HC_TERMINAL_ID` is unset. Every brief stands alone. Each report opens with `PASS`, `ISSUES`, or `BLOCKED` plus evidence. A worker that can prove a defect lists every issue it can prove, not only the first.

## Aggregate

Drop a result that lacks the SHAs and method its brief named, and redispatch that worker once. A second miss is a gap, and a gap never counts as a pass. Apply the selection rule declared in Frame. Summarize; never paste raw worker output.

## Report

One table (slice or arm, status, evidence), one line per issue, gaps and dropouts, and the selection rule for a race.
