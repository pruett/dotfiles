# Spike: Vercel Board as fleet's store (2026-11-22)

Question: can `@vercel/board` (Apache-2.0, github.com/vercel/board, v0.54.0) carry fleet's
inbox, queue, leases and worker tasks, on our own storage, inside one Cloudflare Durable Object
per fleet?

Answer: yes, in a local test. Board's own server code ran unchanged inside a Durable Object
under `wrangler dev`, on DO SQLite, and passed `vb conformance` 86/86 (5 skipped: Vercel-team
checks). Records survived a restart. Three gaps remain before it is fit for real use (below).
Nothing was deployed.

## What was run

| Test | Local `vb serve` | Durable Object (`wrangler dev --local`) |
|---|---|---|
| Inbox: post twice with one `--idempotency-key` → one message | pass | pass |
| Queue item: thread + labels + PNG attachment; `label state=answered --if state=open` twice → second fails | pass | pass (attachment lost on restart) |
| Lead lease: task claimed by `mac-studio`, `vm-2` claim fails `task_claimed` | pass | pass |
| Lease expiry: 30 s lease lapses, `vm-2` takes over, stale `mac-studio` complete fails "Lost the claim" | pass | pass |
| Worker tasks: reviewer task `--needs` implementer task, not ready until it completes | pass | pass |
| prd.md (5.3 KB) as a message and as an attachment | pass | pass |
| `vb tail fleet/` streams every change | pass | pass |
| Data after restart | — | records yes, attachments no |
| `vb conformance` | — | 86 passed, 5 skipped |

Worker bundle: 1.94 MB, 387 KB gzip (`wrangler deploy --dry-run`).

## How it runs in the Durable Object

- `worker.mjs`: a DO class builds `board({ backend: local({ dir: "/tmp/board" }), authenticate })`
  and hands each request to `team.fetch`. `authenticate` accepts one shared bearer token
  (`BOARD_TOKEN` on the client) and returns a person `fleet:user:pruett`; `--as <profile>`
  names the agent (lead-flight-sync, captain, mac-studio).
- `sqlite-shim.mjs`: a ~30-line `node:sqlite` `DatabaseSync` over `ctx.storage.sql`, wired in two
  ways because Board loads SQLite two ways: a wrangler `alias` for `import "node:sqlite"`, and a
  patched `process.getBuiltinModule`. It skips `pragma journal_mode|synchronous|busy_timeout`
  and `begin`/`commit`/`rollback`, which DO SQL refuses.
- Client: `BOARD_URL=https://<worker>/api/board BOARD_TOKEN=… vb …`, or `board()` from
  `@vercel/board` in `scripts/fleet`.

Spike files (scratch, may be cleared): the session scratchpad `spike/` folder: `spike-a.sh`,
`spike-b.sh`, `do/worker.mjs`, `do/sqlite-shim.mjs`, `do/wrangler.jsonc`, `conf-do.txt`.

## Gaps

1. **Attachments live in the isolate's `/tmp`** and are gone after a restart. `local()` builds
   its file store with an internal `fsBlob()`. R2 needs the internal `a2({ store, scheduler, blob })`
   factory, which the package does not export (`dist/local-*.mjs:10453`). Fix: a small patch
   that exports it, or ask upstream for a public backend factory.
2. **No rollback.** The shim turns `begin`/`commit`/`rollback` into no-ops. Board's writes run
   synchronously from begin to commit (`dist/sqlite-db-*.mjs`), so a DO commits them together,
   but a write that throws halfway keeps its first half. Fix: wrap with `ctx.storage.transactionSync`
   (needs the same internal access as gap 1).
3. **Timers are `setTimeout` in the DO** (`localScheduler()`). Lease expiry is checked on read and
   worked, but scheduled messages and watcher retries die when the DO is evicted. Fix: a scheduler
   on DO alarms (internal again).

Also:
- Push is SSE (`tail`, `events` long-poll up to 300 s), not hibernating WebSockets. An open
  `fleet watch` keeps the DO awake and billed for duration. Measure on Workers Free/Paid.
- `renew` without `--lease` resets to the 15-minute default, not the original lease: fleet must
  pass `--lease 2m` each time.
- The package moves fast (pushed the day of this spike). Pin the version; the shim depends on
  internal file layout.
- Unmeasured: CPU per request on Workers Free (10 ms limit?) with a 387 KB gzip bundle.

## Mapping fleet onto Board

| Fleet | Board |
|---|---|
| Captain inbox, `fleet report`, `fleet send` | channel `fleet/inbox`; `post --as lead-<p> --idempotency-key`; done = label `handled=…` |
| CEO queue item, answer | thread in `fleet/queue`, labels `state priority kind project`, attachments; answer = reply + `label state=answered --if state=open` |
| `fleet-slack` | Board's Slack sync (not tested here) |
| Lease on a lead or the Captain | a task per lead in `fleet/leases`, claimed `--as <machine> --lease 2m`, renewed by `fleet watch` |
| Lead → worker chunks | tasks in `fleet/work/<p>` with `--needs`, claimed `--ready --label role=…` |
| prd.md, brief.md, decisions.md | messages or attachments in `fleet/docs/<p>` (attachments need gap 1) |
| Project status | labels on a thread in `fleet/projects`, `--if` for changes |
