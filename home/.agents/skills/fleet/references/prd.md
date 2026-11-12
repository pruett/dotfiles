# The PRD

The PRD is the `## PRD` section of `prd.md`: six fields the lead fills from the brief, the playbook and a light look at the repo, and the CoS signs with `fleet project approve`. Once signed it stays fixed; `fleet run` refuses if it changes, until new work (`fleet project goal`) sends it back for another round.

Each field ends with its source in brackets: `(brief)`, `(playbook)`, `(repo)`, `(CoS)`, or `(lead)` for your own call. A field you cannot settle stays as `TBD: <question> — rec: <your answer>`; the CoS answers it. `approve` refuses while any field is empty or holds `TBD`.

| Field | Filled when |
|---|---|
| **Goal** | One sentence: the outcome in the CEO's terms. |
| **Done when** | Checkable conditions, each with the evidence that proves it (PR merged to X, screenshots at Y, a measured number). |
| **Repos** | Each repo's absolute path, its base branch, and the branch PRs target. |
| **Worktrees** | The `wt` naming (`wt new <repo>/<p>-<slug>`), any setup each needs (a script, env files), and that the `Repos` checkouts themselves are never edited. |
| **Scope** | What is in, what is out, and paths no worker may change. |
| **Verification** | How to run the app and the tests, and whether a tester and screenshots are required. |

## Example

```
## PRD
### Goal
A /compare page where a user picks up to 4 products and sees ingredients and trust scores side by side.   (brief)
### Done when
- /compare?ids=a,b,c renders all 3 with ingredient rows aligned by nutrient   (lead)
- PR open against dev, reviewer PASS, tester screenshots at 390px and 1440px   (lead)
### Repos
$FLEET_WORK_ROOT/suppco/web · base dev · PRs target dev   (playbook)
### Worktrees
wt new web/compare-page-<slug>; Scripts/worktree-stack.sh in each; never edit $FLEET_WORK_ROOT/suppco/web itself   (repo)
### Scope
In: apps/web/app/compare/**, shared product components. Out: backend.
TBD: may it add an API route? — rec: existing endpoints only
### Verification
pnpm test, pnpm verify-suppco, a tester run with screenshots   (repo)
```
