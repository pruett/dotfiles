# Cloud platforms for fleet state

Research note, 2026-11-21. Every pricing page below was read on 2026-11-21. Claims marked **unverified** could not be confirmed against a primary source.

Platforms compared: **Cloudflare** and **Vercel** (asked for), plus:

- **Supabase**: the strongest "managed services" alternative. It gives a real Postgres (multi-statement transactions), push to clients (Realtime), file storage, queues and cron from one vendor, and it is the database Vercel itself points to through its Marketplace.
- **Fly.io**: the strongest "run it yourself" alternative. One small always-on VM running the same Node process and `node:sqlite` file as the local fallback, and the same vendor can host agent VMs (Machines, Sprites).

Workflow engines (Temporal, Inngest, Restate) were not picked as columns: fleet's only long wait is "a queue item waits for the CEO's answer", and that fits in a database row plus push. Both Cloudflare and Vercel already ship a durable-workflow product if one is needed later.

## 1. Summary

- **Cloudflare is the only platform where every building block exists first-party and in one place.** One Durable Object (DO) per fleet gives a single-threaded writer with a co-located, strongly consistent SQLite database, transactions, alarms for lease expiry, and WebSockets that hibernate with no duration charge while idle.
- **Vercel has good durable workflows (hooks for "wait for the CEO") and blob storage, but no first-party transactional database or lease primitive.** State would live in a Marketplace Postgres (a third vendor), and its WebSockets are public beta and close at the function's max duration (300 s on Hobby).
- **Supabase covers storage, push, files and queues well (Postgres + Realtime + Storage + pgmq), but has no durable workflows, and free projects pause after one week of inactivity.** Leases are hand-built on Postgres rows.
- **Fly.io is the simplest model (your Node server + `node:sqlite` on a volume, the same code as the local fallback) but you build everything yourself**, a volume lives on one host with no replication, and there is no free tier (personal bills under $5 are waived).
- **Recommendation: keep the draft.** Cloudflare Worker + one DO per fleet (DO SQLite) + R2 + hibernating WebSocket, bearer token now, Cloudflare Access service tokens later. Skip Cloudflare Workflows and Queues at first; DO alarms and rows cover the waits. Cost: $0 on Workers Free, or $5/month on Workers Paid (needed only if agents move into Cloudflare Containers).

## 2. Building-block matrix

| # | Building block | Cloudflare | Vercel | Supabase | Fly.io |
|---|---|---|---|---|---|
| 1 | Strongly consistent storage per entity, multi-statement transactions | DO SQLite: storage "lives together with the object", "strongly consistent"; `transactionSync()` [cf-do-what], [cf-do-sql] | None first-party. Marketplace Postgres (Neon, Supabase) or Redis (Upstash) [v-storage] | Postgres (ACID) [sb-pricing] | None managed. `node:sqlite` on a Fly Volume inside one Machine [fly-vol] |
| 2 | Single-writer leases with TTL | No lease API. Build it: a DO is "single-threaded" [cf-do-what] + lease row + `setAlarm()` to expire it [cf-do-alarm] | None. Build on the Marketplace DB | None. Build on a Postgres row (`expires_at`) | None. Build in-process (one Machine is the only writer) |
| 3 | Durable workflows, timers, sleep-until-event | Workflows: `step.sleep` up to 365 d, `step.waitForEvent` up to 365 d, `instance.sendEvent()` [cf-wf-limits], [cf-wf-events]. Also DO alarms (one per object) [cf-do-alarm] | Vercel Workflows: `sleep()` no limit, hooks / webhooks resumed by `resumeHook()`; no compute while suspended [v-wf-concepts], [v-wf-pricing] | None. Supabase Cron (pg_cron, down to every second) for timers [sb-cron] | None |
| 4 | Queues | Cloudflare Queues; free plan 10,000 ops/day, 24 h retention [cf-queues] | Vercel Queues, **beta**; TTL up to 7 d, idempotency keys, 100 MB messages [v-queues], [v-queues-pricing] | Supabase Queues (pgmq): exactly-once within a visibility window [sb-queues] (GA/beta status **unverified**) | None |
| 5 | Blob storage | R2: 10 GB-month free, free egress, 5 GiB single PUT [cf-r2-pricing], [cf-r2-limits] | Vercel Blob: Hobby 1 GB, 5 TB max file [v-blob] | Supabase Storage: 1 GB free, 50 MB max upload on Free [sb-pricing] | Tigris (S3-compatible), billed on the Fly bill [fly-tigris] |
| 6 | Realtime push, and cheap idle | DO WebSocket Hibernation: no GB-s while idle, pings auto-answered without waking; incoming messages billed 20:1 [cf-do-ws], [cf-do-pricing] | WebSockets on Functions, **public beta** since 2026-06-22; close at max duration (Hobby 300 s, Pro 800 s); memory billed while open [v-ws] | Realtime (Broadcast, Postgres Changes); Free: 200 concurrent connections, 2 M messages/month [sb-realtime-limits], [sb-pricing] | Your own WebSocket server; Machine must stay running |
| 7 | Auth for headless machine clients | Your own bearer secret in the Worker, or Access service tokens (`CF-Access-Client-Id` / `-Secret` headers, chosen duration) [cf-access-tokens] | Your own bearer secret; `x-vercel-protection-bypass` if Deployment Protection is on [v-bypass] | Secret API keys `sb_secret_...` (backend only, bypass RLS); `service_role` deprecated by end of 2026 [sb-keys] | Your own bearer secret |
| 8 | Local dev / emulator | `wrangler dev` runs Miniflare on `workerd`; DOs and Workflows "always run locally" [cf-dev]. Fully offline **unverified** | Workflow SDK "Local World" needs no setup [v-wf] ; no local Functions WebSocket story found | `supabase start` (needs Docker) runs Postgres, Auth, Storage locally [sb-local]; Realtime locally **unverified** | Identical: the same Node process runs on a laptop |
| 9 | Limits that matter | 10 GB SQLite per DO (Paid), 1 GB on Free; 8 MB row/value; 100 KB SQL statement; 30 s CPU per request (up to 5 min); 32 MiB WS message; attachment state per socket 16 KB [cf-do-limits], [cf-do-ws] | Function 300 s (Hobby) / 800 s (Pro); 4.5 MB request body; Workflow payload 50 MB, 25,000 events per run [v-fn-limits], [v-wf-pricing] | DB 500 MB Free / 8 GB Pro; Edge Functions 150 s Free / 400 s paid, 2 s CPU, 256 MB [sb-pricing], [sb-fn-limits] | Volume 1–500 GB, one Machine per volume, no replication [fly-vol] |
| 10 | Pricing shape for a personal tool | Free plan: DO SQLite allowed, 100k req/day, 5 GB storage. Paid: $5/month minimum covers Workers + DO [cf-do-pricing], [cf-workers-pricing]. Idle hibernated DO costs nothing | Hobby free with monthly allowances (e.g. 50k Workflow events) [v-wf-pricing]; Pro $20/month platform fee incl. $20 credit [v-pro]. Plus the Marketplace DB's own bill | Free $0 (2 projects, **paused after 1 week idle**); Pro from $25/month [sb-pricing] | No free tier; personal-org bills under $5 waived; 256 MB Machine $2.19/month always-on; volume $0.15/GB-month [fly-pricing] |

## 3. Platform notes

### Cloudflare

- **Fit.** One DO per fleet is the whole coordination layer: a fleet name maps to one DO with a "globally-unique name" [cf-do-what]; requests to it are serialised, so idempotency checks ("have I seen this request id?") and lease checks run without races inside one `transactionSync()` [cf-do-sql].
- **Transactions.** `sql.exec()` refuses `BEGIN TRANSACTION` / `SAVEPOINT`; use `transactionSync()`, and writes with no `await` between them commit atomically [cf-do-sql]. The `node:sqlite` fallback can use plain `BEGIN`, so the shared code needs a small `tx(fn)` adapter.
- **Backups.** Point-in-time recovery to any point in the last 30 days; not available in local dev [cf-do-sql].
- **Alarms.** One alarm per DO at a time, at-least-once, auto-retried up to 6 times [cf-do-alarm]. For many lease expiries, keep the soonest expiry in the alarm and rescan on fire.
- **Hibernation gotchas.** Alarms, `setTimeout`/`setInterval`, and outgoing WebSockets keep the DO awake; the constructor re-runs on wake; per-socket state must go through `serializeAttachment` (16 KB max) [cf-do-ws]. So the DO should push from request handlers, not from timers.
- **Billing dates.** DO SQLite storage billing started 2026-01-07 [cf-do-pricing]; Workflows storage/step billing began 2026-08-10 [cf-wf-pricing].
- **Free vs Paid.** Free plan limits reset daily and over-limit operations fail [cf-do-pricing]. Free Workers get 10 ms CPU per invocation [cf-workers-pricing]; whether a DO on Free gets the same 10 ms or the 30 s DO limit is **unverified**.
- **Workflows** fit "queue item waits for the CEO" exactly (`waitForEvent` + `sendEvent`, event buffered if sent early), but timeout throws and fails the instance unless caught [cf-wf-events]. Not needed for v1.

### Vercel

- **No home for state.** First-party storage is Blob, Global Config (read-mostly config) and an ephemeral Runtime Cache; relational data goes to Marketplace providers (Neon, Upstash, Supabase) [v-storage]. Fleet on Vercel means two vendors and building leases and idempotency in Postgres.
- **Workflows are the strongest piece**: hooks pause a run until `resumeHook(token, payload)`; no compute while suspended; no limit on sleep or run duration; hook token is routing, not auth [v-wf-concepts], [v-wf-pricing]. Hobby includes 50,000 events/month; Workflow Data Retained is not available on Hobby [v-wf-pricing].
- **Push is weak for an always-connected CLI watcher.** WebSockets are beta, pinned to one instance, closed at max duration (300 s on Hobby), and in-memory state is not shared between instances, so a broadcast needs an external store such as Redis [v-ws].
- **Queues** are beta [v-queues].
- **Daemons** (long-running processes) are public beta, production only, with ephemeral storage and no autoscaling [v-daemons].

### Supabase

- **Fit.** Postgres gives real transactions; a `requests(id primary key)` table gives idempotency; Realtime pushes row changes or Broadcast messages to CLI, panel and Slack bridge. Realtime transport is WebSocket per Supabase's client libraries, **unverified** from the fetched page [sb-realtime].
- **Free-tier trap.** "Free projects are paused after 1 week of inactivity" [sb-pricing]. Whether CLI API traffic counts as activity is **unverified**. Pro is from $25/month [sb-pricing].
- **No durable workflows**; Cron (pg_cron) can poll for expired leases or timed-out queue items every second [sb-cron].
- **Keys.** Move to `sb_secret_...` keys; legacy `service_role` is deprecated by the end of 2026 [sb-keys].
- **Edge Functions** are short (150 s wall clock on Free, 2 s CPU) [sb-fn-limits]; fine for API calls, not for agents.

### Fly.io

- **Fit.** One `shared-cpu-1x` Machine ($2.19/month at 256 MB) with a volume holds a Node server that is the local fallback, so the cloud and local code paths are the same [fly-pricing].
- **Durability is on you.** A volume is "a slice of an NVMe drive on one physical server", not replicated; daily snapshots (5-day default retention) "may not have your latest data" [fly-vol]. You would add Litestream/LiteFS or accept loss of up to a day.
- **Idle.** Autostop/suspend stops CPU/RAM billing [fly-suspend], but a watcher holding a WebSocket open probably keeps the Machine running (**unverified**), so plan on always-on.
- **Pricing.** No free tier for new orgs; $1 trial credit; personal orgs with a bill under $5 have it waived [fly-pricing].

## 4. Agent hosting

Can the platform run a Claude Code CLI session with a repo checkout, or only the coordination layer?

| Option | Runtime limit | Persistent disk | Cost shape | Notes |
|---|---|---|---|---|
| **Cloudflare Containers / Sandbox SDK** | No fixed max; stays up while its DO is active; inactivity timeout up to 6 h; "does not guarantee that an instance runs for a set time" [cf-sb-life] | No: disk lost on stop. Snapshots (public beta, 20 GB max, 30-day expiry) or mount R2 [cf-sb-life], [cf-ct-limits] | Workers Paid only. Included: 25 GiB-h memory, 375 vCPU-min, 200 GB-h disk/month; then $0.0000025/GiB-s, $0.000020/vCPU-s; largest type 4 vCPU / 12 GiB / 20 GB [cf-ct-pricing] | Docs have a "Coding agents" guide for Claude Code; the Worker injects the API token so the sandbox never holds it [cf-sb-agents]. Code running inside does not by itself keep it alive [cf-sb-life] |
| **Vercel Sandbox** | Per session: 45 min Hobby, 24 h Pro; persistent sandboxes resume indefinitely across sessions [v-sb-pricing] | Yes: persistence is default (auto-snapshot on stop, GA); 64 GB ephemeral NVMe; Drives for shared storage [v-sb-persist], [v-sb-pricing] | Hobby: 5 h active CPU, 420 GB-h memory free/month. Pro: $0.128/CPU-h (active only), $0.0212/GB-h memory, snapshots $0.08/GB-month [v-sb-pricing] | Billing on active CPU suits agents that mostly wait on the model. Vercel also documents running Claude Code durably [v-wf] |
| **Fly Machines** | No limit found (**unverified**) | Volume up to 500 GB, one Machine each [fly-vol] | Per second while running; stopped Machines pay rootfs $0.15/GB-month [fly-pricing] | A full VM; you manage images and lifecycle |
| **Fly Sprites** | No max stated; idle timers reset on output, connections or tasks [fly-sprites] | Yes: 100 GB, automatic checkpoints | $0.0385/CPU-h and $0.021875/GB-h only while running; hot storage ≈ $0.50/GB-month, cold ≈ $0.02/GB-month [fly-sprites] | "Full Linux computers designed for agents" |
| **E2B** | 1 h/session Hobby, 24 h Pro; limit resets on pause/resume [e2b-pricing], [e2b-persist] | Pause saves filesystem and memory, "kept indefinitely" [e2b-persist]; cost while paused **unverified** | Hobby $0 + one-time $100 credit; Pro $150/month; $0.000014/vCPU-s, $0.0000045/GiB-s [e2b-pricing] | |
| **Modal Sandboxes** | Default 5 min, max 24 h; longer via filesystem snapshots [modal-sb] | Volumes and filesystem snapshots [modal-sb] | Starter $0 + $30/month credit; sandboxes billed at 3x list (non-preemptible) [modal-pricing] | |

Takeaway: Vercel Sandbox and Fly Sprites are the closest match to "a lead's long-lived workspace that survives between runs"; Cloudflare's sandbox is a per-task box whose disk is lost on stop. Hosting agents is a separate decision from the coordination layer: any of these can call the fleet API with a bearer token.

## 5. Recommendation per building block

| # | Building block | Pick | Why |
|---|---|---|---|
| 1 | Consistent storage + transactions | DO SQLite, one DO per fleet | Strongly consistent, co-located, SQLite (same dialect as `node:sqlite`), 30-day PITR [cf-do-what], [cf-do-sql] |
| 2 | Leases | `leases` table in the DO + one DO alarm | Single-threaded DO makes compare-and-set trivial; alarm expires and broadcasts [cf-do-what], [cf-do-alarm] |
| 3 | Durable waits | None in v1: a queue item is a row in `pending`; the lead waits on the WebSocket. Cloudflare Workflows later if multi-step server-side logic appears | Avoids a second state store; Workflows' `waitForEvent` is the upgrade path [cf-wf-events] |
| 4 | Queues | None in v1: the inbox and queue are tables | Volume is tiny; Cloudflare Queues retention is 24 h on Free [cf-queues] |
| 5 | Blobs | R2, keyed `<fleet>/queue/<id>/<file>`, DO stores metadata | Free 10 GB and free egress [cf-r2-pricing] |
| 6 | Push | DO WebSocket Hibernation; clients send a cursor (last change seq) on reconnect | No duration charge while idle; auto ping/pong [cf-do-ws] |
| 7 | Auth | Shared-secret bearer token checked in the Worker (Workers secret); Access service tokens if per-machine revocation is wanted | Service tokens give expiry and refresh without code [cf-access-tokens] |
| 8 | Local dev | `wrangler dev` for the Worker/DO; `node:sqlite` fallback for offline use | DOs run locally under Miniflare/workerd [cf-dev] |
| 9 | Limits | Keep attachments in R2 (8 MB row limit), docs in rows (well under 8 MB), batch WebSocket frames | [cf-do-limits], [cf-do-ws] |
| 10 | Pricing | Start on Workers Free; move to Paid ($5/month) for Containers or if Free daily caps bite | [cf-do-pricing], [cf-workers-pricing] |

## 6. Minimal component list

| Component | Stores or does |
|---|---|
| **Worker (`fleet-api`)** | HTTPS entry; checks the bearer token; routes `/<fleet>/...` to that fleet's DO; issues R2 upload/download for attachments |
| **`FleetDO` (one per fleet)** | SQLite tables: `projects` (name, lead, status aligning/active/parked/closed, approved PRD hash), `inbox` (id, from, body, state unread/done), `queue_items` + `answers` (answer history) + `attachments` (R2 key, name, type, size), `docs` (project, kind brief/prd/decisions, body, version), `leases` (role key e.g. `captain` / `lead-<p>`, holder machine id, expires_at), `requests` (request id → stored response, for idempotent writes), `changes` (monotonic seq log for push and catch-up). One alarm = soonest lease expiry. Hibernating WebSockets fan changes out |
| **R2 bucket** | Attachment bytes (PNG, .md, .txt) |
| **`fleet` CLI store adapter** | One interface, two backends: HTTP+WebSocket to the Worker (default) and `node:sqlite` with the same schema (fallback); `tx(fn)` maps to `transactionSync` vs `BEGIN` |
| **Doc mirror in the CLI** | Writes `brief.md` / `prd.md` / `decisions.md` to local files for agents; uploads edits with the base version (compare-and-set); rejects or merges on version mismatch |
| **Clients** | `fleet inbox --wait` (WebSocket instead of 3 s polling), desktop panel, Slack bridge: each subscribes with a cursor |

## 7. Open questions

1. Doc conflicts: if two machines edit `prd.md` offline, is "reject and re-pull" enough, or is a merge needed? Only the lead holding the lease should write, which may make this moot.
2. Lease TTL and renewal interval, and what a machine does when it loses a lease mid-run (kill the pane, or mark it read-only).
3. How the `node:sqlite` fallback syncs back to the cloud after being offline (replay the `requests` log, or forbid offline writes while a cloud fleet exists).
4. One DO per fleet vs one per project: per fleet keeps cross-project reads (Captain's status view) in one transaction; per project only matters past the 10 GB / single-thread limits, which a personal tool will not hit.
5. Whether agents stay on local Herdr or move into Vercel Sandbox / Fly Sprites; that choice is independent of the coordination layer.
6. Unverified items to check before building: DO CPU limit on Workers Free; `wrangler dev` fully offline; Fly Machine behaviour with an idle open WebSocket under autostop; Supabase activity definition for pausing.

## Sources

All read 2026-11-21.

Cloudflare
- [cf-do-what] https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/
- [cf-do-sql] https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- [cf-do-alarm] https://developers.cloudflare.com/durable-objects/api/alarms/
- [cf-do-ws] https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- [cf-do-limits] https://developers.cloudflare.com/durable-objects/platform/limits/
- [cf-do-pricing] https://developers.cloudflare.com/durable-objects/platform/pricing/
- [cf-workers-pricing] https://developers.cloudflare.com/workers/platform/pricing/
- [cf-wf] https://developers.cloudflare.com/workflows/
- [cf-wf-limits] https://developers.cloudflare.com/workflows/reference/limits/
- [cf-wf-events] https://developers.cloudflare.com/workflows/build/events-and-parameters/
- [cf-wf-pricing] https://developers.cloudflare.com/workflows/reference/pricing/
- [cf-queues] https://developers.cloudflare.com/queues/platform/pricing/
- [cf-r2-pricing] https://developers.cloudflare.com/r2/pricing/
- [cf-r2-limits] https://developers.cloudflare.com/r2/platform/limits/
- [cf-access-tokens] https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
- [cf-dev] https://developers.cloudflare.com/workers/development-testing/
- [cf-ct-pricing] https://developers.cloudflare.com/containers/pricing/
- [cf-ct-limits] https://developers.cloudflare.com/containers/platform-details/limits/
- [cf-sb] https://developers.cloudflare.com/sandbox/ (overall beta/GA status not stated: **unverified**)
- [cf-sb-life] https://developers.cloudflare.com/sandbox/concepts/lifetime/
- [cf-sb-agents] https://developers.cloudflare.com/sandbox/coding-agents/

Vercel
- [v-wf] https://vercel.com/docs/workflows
- [v-wf-concepts] https://vercel.com/docs/workflows/concepts
- [v-wf-pricing] https://vercel.com/docs/workflows/pricing
- [v-queues] https://vercel.com/docs/queues
- [v-queues-pricing] https://vercel.com/docs/queues/pricing
- [v-blob] https://vercel.com/docs/vercel-blob/usage-and-pricing
- [v-storage] https://vercel.com/docs/storage
- [v-fn-limits] https://vercel.com/docs/functions/limitations
- [v-ws] https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- [v-bypass] https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
- [v-daemons] https://vercel.com/docs/daemons
- [v-pro] https://vercel.com/docs/plans/pro-plan
- [v-sb-pricing] https://vercel.com/docs/sandbox/pricing
- [v-sb-persist] https://vercel.com/docs/sandbox/concepts/persistent-sandboxes

Supabase
- [sb-pricing] https://supabase.com/pricing
- [sb-realtime] https://supabase.com/docs/guides/realtime
- [sb-realtime-limits] https://supabase.com/docs/guides/realtime/limits
- [sb-fn-limits] https://supabase.com/docs/guides/functions/limits
- [sb-queues] https://supabase.com/docs/guides/queues
- [sb-cron] https://supabase.com/docs/guides/cron
- [sb-keys] https://supabase.com/docs/guides/api/api-keys
- [sb-local] https://supabase.com/docs/guides/local-development

Fly.io
- [fly-pricing] https://docs.fly.io/about/pricing
- [fly-suspend] https://docs.fly.io/reference/suspend-resume
- [fly-vol] https://docs.fly.io/volumes/overview
- [fly-tigris] https://docs.fly.io/tigris/
- [fly-sprites] https://fly.io/sprites.md

Other agent hosts
- [e2b-pricing] https://e2b.dev/pricing
- [e2b-persist] https://docs.e2b.dev/sandbox/persistence
- [modal-pricing] https://modal.com/pricing
- [modal-sb] https://modal.com/docs/guide/sandbox
