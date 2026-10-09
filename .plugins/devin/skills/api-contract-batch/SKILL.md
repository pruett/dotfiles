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

### Steps

1. In `SuppleCo/web` on `main`, run `node packages/api/scripts/coverage.mjs --format json --spec-source backend`. Take batches in this order (least prod traffic first): plans, protocols, small-modules-2, scheduleOptimizer, shop-cart-checkout, small-modules-4, productLists, ai_chats, shop-orders-subscriptions, articles, shop-wallet, products, small-modules-5, small-modules-1, social, users, small-modules-3, brands; then any other batch in script order. Pick the first with `phase: "backend"` and no PR in any state (`gh pr list -R SuppleCo/backend --head api-contract/<batch> --state all`). If no batch qualifies, DM Kevin "nothing to do" (see step 10) and stop.
2. Find the batch's calls with state `no-response-schema`, `no-required`, or `not-in-spec`. For each endpoint, read the route, the controller, and the serializer in `app/serializers` (or the inline `render json:`). Find each key, its type, if it is always present, and if it can be null. If the route does not exist, record the frontend path and the nearest real route.
3. Write the response schema in the spec:
   - `required`: keys that are always present. An Alba attribute with `if:` is not always present.
   - `nullable: true`: the code can return null (column without `null: false`, optional `belongs_to`, `&.`). Do not use fixture values to decide.
   - Document each success status the action returns (`200`, `201`, `204`).
   - If other endpoints use a component with a different serializer, add a new component. Do not change the shared one.
   - Do not set `additionalProperties`.
4. `assert_matches_openapi` (`test/support/openapi_contract_helper.rb`) is on `main`. Do not edit it.
5. For each endpoint, add `assert_matches_openapi` after the request in one happy-path controller test. If no test exists, write a minimal one.
6. Run the changed test files and `bin/rails test test/lib/openapi_validation_test.rb`. If a test fails, fix the spec. If you cannot make it pass, remove that endpoint and record it.
7. Open the PR from branch `api-contract/<batch>` against `main` with the builtin `git_create_pr` (it shows as `devin-ai-integration[bot]`, requested by @pruett). Then label it and assign Kevin:
   - `gh label create api-contract -R SuppleCo/backend --color 0E8A16 --description "Automated API contract batch"` (ignore "already exists");
   - `gh pr edit <N> -R SuppleCo/backend --add-label api-contract --add-assignee pruett`.
   If either command fails, keep going and include the error in the DM.
   - PR body: endpoints, gaps closed, surprises (null fields, wrong paths, frontend type mismatches), skipped endpoints with reasons, test commands.
   - Do not use closing keywords (`fixes`, `closes`, `resolves`).
8. Wait for CI. Fix failures that your change causes. Explain other failures in a PR comment. Resolve or answer review comments.
9. Merge if all of these pass:
   - `ruby /tmp/gate.rb origin/main HEAD` (script below, saved outside the repo) prints `"low_risk": true`;
   - the builtin `git_pr_checks` shows every check passed (`gh pr checks` is disabled in Devin sessions);
   - the builtin `git_view_pr` shows no unresolved review threads;
   If all hold, run `command gh pr merge <N> -R SuppleCo/backend --merge --match-head-commit <HEAD SHA>` once. Do not retry with other flags. Kevin (@pruett) has explicitly pre-approved this merge into `main` for PRs this automation opens that pass every check above; that approval is why `command gh` is used to skip Devin's main-branch merge guard. It does not cover any other PR or any failed check.
10. DM Kevin on Slack: `lookup_slack_resource` for user `U0BSW9J3X4K`, then post to its `dm_channel_id`. One message: `:rocket: Merged <url|#N>`, `:eyes: Needs review <url|#N>: <reasons or merge error>`, or `:information_source: Nothing to do`. Mention operations added and public `/openapi.json` operations touched, from the script output.
11. Report: batch, PR URL, endpoints done and skipped, CI status, merged or why not, DM sent.

### Gate script (`/tmp/gate.rb`)

```ruby
require 'yaml'; require 'json'
base_ref, head_ref = ARGV.fetch(0, 'origin/main'), ARGV.fetch(1, 'HEAD')
mb = `git merge-base #{base_ref} #{head_ref}`.strip
load_spec = ->(ref) { YAML.safe_load(`git show #{ref}:swagger/v1/openapi.yml`, aliases: true) }
old, new = load_spec.(mb), load_spec.(head_ref)
fails = []
files = `git diff --name-only #{mb} #{head_ref}`.split("\n")
allowed = %r{\A(swagger/v1/openapi\.yml|test/controllers/api/.+_test\.rb|test/support/openapi_contract_helper\.rb|test/test_helper\.rb)\z}
bad = files.reject { |f| f.match?(allowed) }
fails << "files outside allowlist: #{bad.join(', ')}" if bad.any?
ops = ->(s) { s['paths'].flat_map { |p, v| (v.keys & %w[get put post patch delete]).map { |m| "#{m.upcase} #{p}" } }.sort }
removed, added = ops.(old) - ops.(new), ops.(new) - ops.(old)
fails << "operations removed: #{removed.join(', ')}" if removed.any?
touched = []
(old['paths'].keys & new['paths'].keys).each do |p|
  (old['paths'][p].keys & new['paths'][p].keys).each do |m|
    o, n = old['paths'][p][m], new['paths'][p][m]
    next unless o.is_a?(Hash) && n.is_a?(Hash)
    (o.keys | n.keys).each do |k|
      next if o[k] == n[k]
      if k == 'responses' then touched << "#{m.upcase} #{p}"
      else fails << "#{m.upcase} #{p}: '#{k}' changed (only responses may change)" end
    end
  end
  fails << "#{p}: path-level parameters changed" if old['paths'][p]['parameters'] != new['paths'][p]['parameters']
end
(old.keys | new.keys).each { |k| fails << "top-level '#{k}' changed" if k != 'paths' && k != 'components' && old[k] != new[k] }
(old['components'].keys | new['components'].keys).each { |k| fails << "components.#{k} changed" if k != 'schemas' && old['components'][k] != new['components'][k] }
lines = `git diff --numstat #{mb} #{head_ref}`.split("\n").sum { |l| a, d = l.split("\t"); a.to_i + d.to_i }
fails << "#{lines} changed lines (max 1500)" if lines > 1500
fails << "#{touched.size} operations touched (max 30)" if touched.size > 30
pub_src = `git show #{head_ref}:app/services/public_openapi_spec.rb`
public_paths = pub_src[/ALLOWED_PATHS = %w\[(.*?)\]/m, 1].to_s.split
public_touched = touched.select { |t| public_paths.include?(t.split(' ', 2)[1]) }
puts JSON.pretty_generate(low_risk: fails.empty?, failures: fails, changed_lines: lines, operations_touched: touched.size, operations_added: added, public_openapi_operations: public_touched)
```

## Repo specifics
- Update both checkouts to the latest `origin/main` before step 1, so the batch that was just merged is reflected in the backend spec.
- SuppleCo/web: Node 22 and pnpm 10. If `node_modules` is missing or stale, run `pnpm install --frozen-lockfile` from the repo root before running the coverage script.
- SuppleCo/backend: read `AGENTS.md` first. Start Postgres and Redis (`sudo service redis-server start`, `sudo pg_ctlcluster 17 main start`), run `bundle install` if needed, then `RAILS_MASTER_KEY=$RAILS_MASTER_KEY bundle exec rails db:test:prepare` before running tests.
- The batch from the triggering PR counts as taken whether it was merged or closed without merging (the skill skips batches with a PR in any state). Do not retry it.

## Git and PR tooling
- If a remote `api-contract/<batch>` branch exists without a PR, treat the batch as taken: report it and stop.

## Hard rules
- Open at most one PR per run. Merge only that PR, only via step 9. Never approve PRs, use `--admin`, enable auto-merge, or push to `main`.
- Do not use GitHub or Linear closing keywords in the PR title, body, commits, or branch name.

## Final report
End with: confirmation that you followed the pasted api-contract-batch skill, the batch name, the PR URL (or "nothing to do" / why no PR was opened), endpoints done and skipped with reasons, CI status, merged or why not, and whether the DM was sent.
