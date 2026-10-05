# Stub proof mechanics

The stub fault replaces every function the candidate test imports from its subject with one returning `undefined` or nil, then runs only that test file. Green means the test observed nothing. Every stub is written to a scratch copy or a temporary file and removed before step 5; the committed tree stays untouched.

Identify the subject first: the production module(s) the test imports from a relative path. Third-party and framework imports are left alone; stubbing those tests the mock, not the test.

## Vitest / Jest

Prepend to a temporary copy of the test file, one block per subject module:

```ts
vi.mock("../path/to/subject", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(mod).map(([k, v]) => [k, typeof v === "function" ? () => undefined : v]),
  );
});
```

Jest: `jest.mock` with the same factory using `jest.requireActual`. Run `npx vitest run <tmpfile>` or `npx jest <tmpfile>`. Vitest hoists `vi.mock`, so the block may sit after imports; Jest requires it above them.

Classes: replace with a class whose prototype methods all return `undefined`. Default exports: return `{ ...stubbed, default: () => undefined }`.

## RSpec / Minitest

In a temporary spec file that requires the original, add a `before` that stubs every public method of the subject class:

```ruby
before do
  Subject.public_instance_methods(false).each { |m| allow_any_instance_of(Subject).to receive(m).and_return(nil) }
  Subject.singleton_methods.each { |m| allow(Subject).to receive(m).and_return(nil) }
end
```

Run `bundle exec rspec <tmpfile>`. Rails request specs are not stubbed this way; their subject is the route, and the cover check is the right tool.

## Pytest

A temporary `conftest.py` beside the test with an autouse fixture that `monkeypatch.setattr`s every callable in the subject module to `lambda *a, **k: None`. Run `pytest <file>`.

## Go

Table tests over a pure function: temporarily edit a scratch copy of the subject so every exported func returns the zero value, run `go test -run <TestName> ./pkg`. Restore with `git checkout -- <file>` before step 5.

## Cover check

Pick one exported function the candidate exercised. In a scratch edit of the subject, swap its first return value for a wrong literal of the right type (`return 0`, `return ""`, `return nil`). Run the suite with the candidate deleted. Record the first other test that goes red as the owner; none red means no cover. Restore with `git checkout -- <file>`.

## Skipped tests

No fault needed. `git blame -L <line>,<line> --porcelain <file> | grep committer-time`; older than 90 days is Proven.
