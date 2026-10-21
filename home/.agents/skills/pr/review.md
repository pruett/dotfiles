# Review: an adversarial verdict, no edits

Independent reviewers attack the change; this session judges what they find. Apply nothing; an accepted finding becomes a fix only when the user says so.

1. **Scope.** PR number or URL: `gh pr diff <n>`. Branch or nothing: `git diff $(git merge-base main HEAD)...HEAD`. Files the user named: those. Done when you hold the diff and the context files a reviewer needs.

2. **Intent.** One paragraph on what the change is for, from the request, commits, the PR body and the code. Unsure: ask before going on.

3. **Dispatch.** Fill [`references/review-prompt.md`](references/review-prompt.md) and send it per [`references/reviewers.md`](references/reviewers.md). Without Herdr, use two subagents: `model: "opus"` and `model: "fable"`. Done when every reviewer has returned.

4. **Judge.** Merge findings that describe the same issue and note which reviewers raised each; two reviewers raising it independently is the strongest signal. Then filter:
   - "What if X is null?" counts only if a caller can pass null. Trace it.
   - "I would have done it differently" with no concrete problem gets dismissed.
   - Suggested abstractions for code that changes in only one way are premature.
   - Findings on code the diff did not touch, or against a pattern the codebase uses everywhere, show missing context.
   - All nits means the code is probably fine. Say so.
   - Security and correctness findings get extra scrutiny before dismissal, even from one reviewer.

5. **Write the verdict.**

   ```
   ### Intent
   > <step 2 paragraph>

   ### Reviewers
   - <label>: <model>, <N> findings

   ### Act on        real issues that would block the PR; who raised it, why it matters
   ### Consider      legitimate but maybe not worth it now; the tradeoff
   ### Noted         valid, not actionable now (brief list)
   ### Dismissed     each with a one-line reason
   ### Agreement     where reviewers agreed and diverged
   ```
