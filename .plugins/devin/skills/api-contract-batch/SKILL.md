---
name: api-contract-batch
description: "Document one batch of endpoints in the backend OpenAPI spec, test them, and open one backend PR."
argument-hint: "[batch]"
disable-model-invocation: true
---

# API Contract Batch

Do one batch. Open one PR in `SuppleCo/backend`.

Rules:

- The backend code is the truth. Make the spec match the code. Frontend calls are only hints.
- Change only `swagger/v1/openapi.yml` and files in `test/`.
- If the code does not show the response shape, skip that endpoint and record it.

## Steps

1. In `SuppleCo/web` on `main`, run `node packages/api/scripts/coverage.mjs --format json --spec-source backend`. Pick the first batch with `phase: "backend"` that has no PR in any state (`gh pr list -R SuppleCo/backend --head api-contract/<batch> --state all`). If no batch qualifies, report "nothing to do" and stop.
2. Find the batch's calls with state `no-response-schema`, `no-required`, or `not-in-spec`. For each endpoint, read the route, the controller, and the serializer in `app/serializers` (or the inline `render json:`). Find each key, its type, if it is always present, and if it can be null. If the route does not exist, record the frontend path and the nearest real route.
3. Write the response schema in the spec:
   - `required`: keys that are always present. An Alba attribute with `if:` is not always present.
   - `nullable: true`: the code can return null (column without `null: false`, optional `belongs_to`, `&.`). Do not use fixture values to decide.
   - Document each success status the action returns (`200`, `201`, `204`).
   - If other endpoints use a component with a different serializer, add a new component. Do not change the shared one.
   - Do not set `additionalProperties`.
4. If `assert_matches_openapi` does not exist, copy [`references/openapi_contract_helper.rb`](references/openapi_contract_helper.rb) to `test/support/`. Add `include OpenapiContractHelper` to `ActiveSupport::TestCase` in `test/test_helper.rb`.
5. For each endpoint, add `assert_matches_openapi` after the request in one happy-path controller test. If no test exists, write a minimal one.
6. Run the changed test files and `bin/rails test test/lib/openapi_validation_test.rb`. If a test fails, fix the spec. If you cannot make it pass, remove that endpoint and record it.
7. Open the PR from branch `api-contract/<batch>` as the requesting human (see `AGENTS.md`). If you can open it only as the bot, do not push. Report and stop.
   - PR body: endpoints, gaps closed, surprises (null fields, wrong paths, frontend type mismatches), skipped endpoints with reasons, test commands.
   - Do not use closing keywords (`fixes`, `closes`, `resolves`).
8. Wait for CI. Fix failures that your change causes. Explain other failures in a PR comment. Do not merge.
9. Report: batch, PR URL, endpoints done and skipped, CI status.
