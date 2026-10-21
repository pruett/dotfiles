# Draft: open or describe a PR

Write a body that shows a reviewer why the change exists and its shape, in under a minute.

1. **Find or open the PR.**
   - A PR exists: use it.
   - No PR, branch has commits: push with an upstream, then `gh pr create --fill` against the repo's default branch, opened ready (no `--draft`). The body comes in step 4.
   - Uncommitted work and no clear branch: ask which PR this is for.

   Done when you hold a PR number.

2. **Read the change.** `gh pr view <n> --json title,body,files,url`, `gh pr diff <n>`, the linked ticket, and enough surrounding code to know what each changed function does. Done when every changed file maps to a reason it changed.

3. **Pick the views.** Read [`references/show-me.md`](references/show-me.md) for the view catalogue. Choose the smallest set that explains this PR: contracts (SQL, endpoints), key types, pseudocode, a shallow file tree, a component tree, a call or data flow. Order them so the story reads top-down.

4. **Write the body** from [`references/body-template.md`](references/body-template.md):
   - **Why the change**: exactly one sentence.
   - **Special things to note**: 1–3 bullets (migrations, flags that keep it dark, deliberate omissions, surprising decisions), or `- None.`
   - **Change outline**: the views from step 3. `diff` blocks for changes to an existing shape, whole blocks for new shapes.
   - Plain words, one human to another. Real names from the code; no invented terms.

   Save it to `<scratchpad>/pr-<n>.md` and run `gh pr edit <n> --body-file <that path>`.

5. **Report** the PR URL and one line per view you included. Done when `gh pr view <n> --json body` shows the new body.

A request for a plain or short body ("keep it short, tooling only") drops the change outline to one view or none. The template is the ceiling, never the floor.
