# Bake-off

Several agents on different vendors' models build the same artifact from the same brief. A judge scores them, you pick one as the base, then port the best ideas from the others into it. Adapted from pstack's `arena`; the phase letters match it, so pstack skills that cite "arena Phase B" mean the phase here.

Use it for a design with several valid shapes, or work where models disagree in useful ways. Open a todo list with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify).

## Phase A: Frame

Every candidate gets the same brief, so the brief is the contract.

1. State the artifact each candidate produces.
2. Write the rubric: 3-6 concrete criteria for success on *this* task. It is your tool in Phase D. Candidates see only the task.
3. Pick the runners from [`models.md`](models.md): three by default, each from a different vendor or family (for example Opus 5.5, GPT-6.1 Sol and Fable 5.1). Add runners for more design directions, and repeat one model when the work is generation-bound rather than judgment-sensitive.
4. Give each candidate its own output location: a worktree from `wt new <repo>/<slug>-<n>` where possible, otherwise `/tmp/bake-off-<slug>/candidate-<n>/` (**principle-separate-before-serializing-shared-state**).

## Phase B: Fan out

Dispatch every runner per steps 6-7 of the orchestrate skill before waiting on any. Each brief holds the task, pointers to shared grounding, its own output path, and an instruction to return the artifact plus a short rationale naming the alternatives it considered and rejected. Without Herdr (`HC_TERMINAL_ID` unset), spawn the runners as parallel subagents instead.

If a candidate produces nothing, continue with N-1 and note the dropout.

## Phase C: Cross-judge

After every candidate finishes, dispatch one read-only judge on a vendor different from yours (the session's). It scores each candidate by path label, never by model name, on each rubric criterion, and recommends a base. When no other vendor is available, skip the judge and say so.

## Phase D: Pick a base

Read every candidate end to end. Score each against the rubric criterion by criterion, then compare with the judge. Agreement confirms the pick. Disagreement means a bias or an ambiguous rubric: read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two tie, prefer the cleaner boundary or smaller API (**principle-laziness-protocol**).

## Phase E: Graft

Walk each losing candidate once more for what is worth porting, usually one or two things each. Fold each graft in by hand so the result keeps one mental model (**principle-redesign-from-first-principles**).

Candidates that converge on one shape are strong agreement: ship that shape with no graft. Candidates that diverge wildly mean Phase A was under-specified: reframe and re-run rather than averaging.

## Phase F: Verify

Verify the result like any other work (**principle-prove-it-works**). A problem found here means Phase A was wrong (reframe and re-run) or a candidate caught it and you missed the graft (back to Phase E).

## Report

The result, plus a short note: the base and why, the judge's verdict or that it was skipped, each graft and its source, what was rejected and why, convergence or dropouts, and the verification result.
