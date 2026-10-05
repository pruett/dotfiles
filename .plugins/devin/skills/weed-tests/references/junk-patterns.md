# Junk patterns

Each pattern names the shape, the grep that surfaces hits, and the tier the sweep expects after proving. Expected tiers are a prior, never a verdict: every hit still runs the stub fault.

Sources: Matt Pocock's `tdd` and `codebase-design` skills, Lauren Tan's test-behavior principle (vendored in `simplify-pr/references/test-behavior.md`), and the OpenClaw `test-audit` skill.

## Mechanical patterns (expect Proven)

**Assertion-free.** A test body with no assertion call, or whose assertions are only existence checks: `toBeDefined`, `toBeTruthy`, `not.toThrow`, `toBeInstanceOf`, `toBeGreaterThan(0)`, `assert_not_nil`, `assert response`.
Grep: test blocks containing none of `expect(|assert`, or only the listed matchers.

**Self-comparison.** The expected value is produced by the subject itself: `expect(f(a)).toBe(f(a))`, `expect(parsed.url).toBe(buildUrl(...))`, snapshots regenerated without review.
Grep: the same identifier on both sides of a matcher; `toMatchSnapshot|toMatchInlineSnapshot` in files touched only by snapshot-update commits.

**Constant pin.** The assertion restates a hand-maintained constant, config default, prompt string, export list, or manifest: `expect(LIMITS.maxTools).toBe(8)`, `expect(PROMPT).toContain("You are")`, `expect(Object.keys(api)).toEqual([...])`.
Grep: assertions whose receiver is an imported constant rather than a call result; `toContain("` against imported strings; `readFileSync` of a source file in a test.

**Fixture asserts fixture.** The assertion reads data the test built or a `beforeEach` computed, and the subject never runs inside the body.
Grep: test bodies that call no imported function.

**Source grep.** The test reads source text and asserts an import, string, or token is present.
Grep: `readFileSync|fs.read` paired with `toContain|toMatch|includes` in a test file.

**Skipped.** `it.skip`, `test.skip`, `xit`, `xdescribe`, `test.todo`, `pending`, `skip:` whose blame on the skip line is older than 90 days. Dead by declaration; no stub fault needed.
Grep: the markers above, then `git blame -L` on each.

## Judged patterns (expect Covered or Flagged)

**Call-shape.** Mocks an in-repo module and asserts only `toHaveBeenCalled*`, call count, or call order. Red flags from the `tdd` skill: mocking internal collaborators, testing private methods, asserting call counts or order, a test name that describes HOW rather than WHAT.
Grep: `vi.mock\(["']\.|jest.mock\(["']\.` (relative path mocks) in the same file as `toHaveBeenCalled`.

**Mock implements the behavior.** The mock returns exactly what the assertion checks, so the test proves the mock.
Grep: `mockResolvedValue|mockReturnValue|allow(...).to receive(...).and_return` whose literal reappears in an `expect` of the same test.

**Side-channel verification.** Verifies through a channel other than the interface: raw SQL or ORM query after calling the subject, filesystem reads, inspecting private state.
Grep: `db.query|prisma.|knex(|\.find_by\(|readFileSync` inside a test body after a subject call.

**Tautological recomputation.** The expected value is computed from the inputs with the same operation the subject uses: `expected = items.reduce(...)` then `expect(calculateTotal(items)).toBe(expected)`. Passes by construction when both share the formula. Goes red when the subject breaks, so it is Covered only when a literal-oracle sibling exists; otherwise Flagged with the rewrite: replace the computed expected with the known literal.
Grep: a local `expected`, `want`, or `result` variable assigned from an expression over the test inputs rather than a literal.

**Duplicate invocation.** Two tests call the same subject with equivalent inputs and assert the same contract, often one at a shallow module and one at the deepened interface. The `codebase-design` skill: old unit tests on shallow modules become waste once tests at the deepened interface exist.
Grep: identical subject calls across test files for one module; table-driven cases with equal rows.

**Private-method or test-only seam.** Imports a non-exported, underscore-prefixed, or `@internal` symbol, or an export whose only callers are tests. Deleting the test is in scope; the orphaned export is a production follow-up, listed in the PR body.
Grep: `_[a-z]\w*\(` imports; exports with no non-test importer (`grep -rl <name> --include='*.ts' | grep -v test`).

**Negative control for the wrong reason.** A rejection test that passes because of an unrelated guard or a path production never reaches.
Grep: `toThrow()` or `rejects` with no message or error class.

**Name promises more than the input exercises.** A "retires the window" test asserting only that the window was not cleared.
Grep: none reliable; caught while reading hits of other patterns.
