---
name: verify-suppco
description: Boot and drive the SuppCo app (Rails backend + SvelteKit web) from the terminal with the `verify-suppco` CLI, and prove user-facing behavior with its feature map. Use when asked to boot/run/restart the app locally, run it against production or staging data, log in as a user, call the API as a user, screenshot or open a route, run a Playwright script, set up local state with rails/sql, verify a feature, or build/run the native iOS app (Capacitor, Xcode, simulator). Turns the request into `verify-suppco` commands.
---

# verify-suppco

`verify-suppco` is a deterministic CLI on `PATH` (this skill lives in dotfiles; `~/.local/bin/verify-suppco` points at
`bin/verify-suppco`). This skill turns a request into `verify-suppco` commands and, for "prove feature X works", into a
recipe from [`features/`](features/README.md). The table under **Drive** is enough for the rows it lists; run
`verify-suppco help` only for a flag it does not show. When a verb fails, its stderr names the fix: run the fix, do not
work around it.

The checkouts live under `$SUPPCO_ROOT` (default `~/work/suppco`): `backend/`, `web/`, and the CLI's own state dir
`.verify-suppco/`. Set `SUPPCO_ROOT` only if the repos live somewhere else.

## Launch

- `verify-suppco up [--api local|staging|prod] [--db dev|prod|staging|<name>] [--as <email>]` boots the web app on
  `https://localhost:3001` and, with `--api local`, Rails on `http://localhost:3000`. Idempotent: it reuses healthy servers,
  restarts on config change, and returns once `/up` (backend) and the web root answer 200. Do not run `status` first.
- Default `--api prod` boots web only against `api.supp.co`; login there is a real browser login. Everything you can mint
  or drive headlessly needs `--api local`.
- Flags persist in `.verify-suppco/state.json`, so `login`, `api`, `shot`, `rails`, `sql` follow the last `up`.
- Teardown: `verify-suppco down` stops what this CLI started (`--all` also stops servers it did not start).

## Doctor

`verify-suppco doctor` is read-only and prints one line per prerequisite (toolchain, web `node_modules`, the `backend` and
`web checkout` in effect, Postgres, Redis, mkcert CA, `.env.local`, databases and their OAuth app, heroku, Playwright, Xcode,
tunnel) with the fix for anything red. A `checkout` FAIL means the last `--web`/`--backend` pointed at a worktree that no
longer exists: `up`, `env` and `status` name it too, and `verify-suppco up --web web` (or `--backend backend`) clears it. A
`node_modules` FAIL names the package and whether it is a dangling pnpm symlink (an install linked into a deleted worktree);
`up --web web` reinstalls it. Run it before the first
drive of a session and again after any drive that failed for a reason the CLI did not name. `verify-suppco status` says what
is running, against which API/database, and which minted sessions are still fresh.

## Drive

| Request says | Run |
|---|---|
| boot / start / run the app | `verify-suppco up` (idempotent: reuses healthy servers, restarts on config change; no need to run `status` first) |
| …as / logged in as `<email>` | `verify-suppco up --as <email>` or `verify-suppco login <email>` (`--role admin` sets the role first) |
| set me up to test by hand / let me click around | `verify-suppco dev --as <email>` — boots, opens a persistent logged-in Chromium, prints the cheat-sheet |
| …against **production data** | `verify-suppco up --api local --db prod` — local Postgres mirror of the whitelisted production tables; users are never pulled, and the mirror holds only what has been pulled (`verify-suppco sql "select count(*) from products"` tells you if it is empty). Refresh: `verify-suppco db pull --db prod [tables…]` |
| …against **staging data** | `verify-suppco up --api local --db staging` — same mirror scheme, sourced from suppleco-staging's DATABASE_URL (needs Operate on that app). Any table is pullable: `verify-suppco db pull --db staging users products …` |
| …against the **production API** / live prod (default) | `verify-suppco up --api prod` — web only, talks to api.supp.co; login is a real browser login you finish by hand. Staging: `--api staging` |
| run / test branch `<b>` (or a directory) | `verify-suppco up --web <b>` and/or `--backend <b>` — a branch becomes a worktree under `.verify-suppco/worktrees/`; later `rails`/`sql`/`logs rails` follow it. Back to main: `verify-suppco up --backend backend --web web` (from any cwd) |
| the branch has new migrations | `up` stops and lists them; `--migrate` applies them, or keep main's db: `verify-suppco down && verify-suppco db clone api_development api_<b> && verify-suppco up --backend <b> --db api_<b> --migrate` |
| restart / pick up env changes | `verify-suppco down && verify-suppco up …` (`--takeover` replaces servers this CLI did not start) |
| is it running / what is running | `verify-suppco status` |
| something 500s / what does the log say | `verify-suppco api GET /api/... --as <email>` (prints rails ms, sql ms) → `verify-suppco logs rails --grep '/api/<path>' -n 200`; `verify-suppco logs backend` / `web` for process stdout |
| screenshot `<route>` (as `<email>`) | `verify-suppco shot <route> [--as <email>]` — exit 1 and `ERROR PAGE` on the app's error boundary; `REDIRECTED` when the app sent you elsewhere. Reads its `<shot>.json` sidecar before opening a trace |
| call the API as `<email>` | `verify-suppco api GET /api/... --as <email>`, `verify-suppco api POST /api/... --as <email> --json '{...}' --expect 201` |
| click through a flow / anything multi-step | write a tiny Playwright script and run `verify-suppco pw script.mjs --as <email>` (`export default async ({ page, context, base, api, auth, args, shots }) => result`); add `--trace` then `verify-suppco trace` to step through it |
| let me look at it | `verify-suppco open <route> --as <email> --persistent --detach` (reusable logged-in browser, returns immediately) |
| set up data / flip a flag / inspect a row | `verify-suppco rails '<ruby>'` or `verify-suppco sql '<query>'` — both hit the database of the current `--db` |
| a job didn't run / background work | `verify-suppco jobs` (queues, busy workers, last retries and dead jobs with their errors) |
| login is throttled (429 / "too many") | `verify-suppco throttle clear` |
| prove feature `<x>` works | open [`features/README.md`](features/README.md), follow that feature's recipe, capture the evidence it names |
| stop everything | `verify-suppco down` (`--all` also stops servers this CLI did not start) |
| build / run the **native iOS app**, open it in Xcode | `verify-suppco ios` — boots the web behind your tunnel, `cap sync ios` from the current `--web` checkout, opens `App.xcworkspace`; `verify-suppco ios run [--device <name>]` builds onto a simulator instead |
| native app with **working sign-in** | `verify-suppco ios run --api local --api-tunnel <you>-api.supp.co` — both Cloudflare routes must already reach this Mac (backend README → Cloudflare Tunnel) |
| native app against staging / production | `verify-suppco ios --target staging` / `--target prod` (no local web needed) |
| the native app shows a blank page / old config | `verify-suppco ios sync` (forced re-sync; `up`/`run` skip it when nothing changed), then rebuild |
| screenshot the **simulator** / list simulators | `verify-suppco ios shot [--device <name\|udid>] [--out f.png] [--json]` → `.verify-suppco/shots/<stamp>-ios-<device>.png` + `.json` sidecar (`device, udid, target, origin`) and `.run.json`; needs a booted simulator. `verify-suppco ios devices --json` → `[{name,udid,state,runtime}]` |
| record the **simulator** screen / read the app's simulator log | `verify-suppco ios record start [--device <name\|udid>]` … `verify-suppco ios record stop` → `.verify-suppco/videos/<stamp>-ios-<device>.mov` + `.run.json` (`status --json` shows `ios.recording` while live). `verify-suppco ios logs [--grep re] [-n N] [-f]` — last N lines of the app's log (10 min window), or `-f` to stream |

`--api local|staging|prod` picks what the web app talks to (default `prod`: web only; `--api local` boots Rails) and
`--db dev|prod|staging|<name>` picks the local Postgres database Rails uses. Ports are fixed at :3000/:3001.

## Evidence

- `verify-suppco shot <route> --as <email>` writes `.verify-suppco/shots/<timestamp>-<route>-<user>.png` plus a `.json` sidecar
  (final URL, console errors, failed and slow requests). Read the sidecar before trusting the PNG; `REDIRECTED` in it means
  the app moved you (auth guard, wizard, Pro gate), not that the shot failed. `shot` exits 1 on `ERROR PAGE` **or** on a final
  status ≥ 400: a 404 page is exit 1 with `errorPage: false` in the sidecar, which is the right result when 404 is what you expect.
- `verify-suppco api …` prints status, rails ms, sql ms and the body; add `--expect N` to make the wrong status exit 1.
- `verify-suppco pw script.mjs --trace` writes a Playwright trace to `.verify-suppco/traces/`; `verify-suppco trace` opens the latest.
- Add `--video` to `shot` or `pw` to record `.verify-suppco/videos/<timestamp>-<slug>[-<user>].webm`; its path is `video` in
  the sidecar / pw result. Every `shot`/`pw` also writes `<timestamp>-<slug>[-<user>].run.json` next to its output (`shots/`
  for pw) listing `verb`, `argv`, `startedAt`, `exitCode`, `artifacts` and `feature` (from `$VERIFY_FEATURE`).
- Side effects: prove them with a read-only second look, `verify-suppco sql '<select>'` or `verify-suppco rails '<ruby>'`,
  never by trusting the UI alone.
- Evidence survives `down`: nothing under `.verify-suppco/shots`, `traces` or `videos` is removed by teardown. Name the
  files in your report. `verify-suppco report [--feature id] [--since ts] [--out f.md]` writes a markdown summary of that
  evidence (one section per run, newest first, with relative links and each sidecar's entry point, final URL and errors) to
  `.verify-suppco/reports/<timestamp>.md` and prints its path.

## Cleanup

`verify-suppco down` kills only the process groups this CLI started (state record + env-marker sweep); it never kills by name.
Servers it did not start are `foreign`: a default `up` adopts them, anything else refuses, `--takeover` replaces them and
`down --all` stops them. Detached browsers from `open --detach` are separate and close when you close the window. Worktrees
under `.verify-suppco/worktrees/` persist; remove with `git worktree remove <path>` from the repo that owns them.

## Helpers

Everything ships inside this directory and is executable:

- `bin/verify-suppco` — bash shim; picks the web repo's Node/pnpm via `mise exec -C $SUPPCO_ROOT/web`, exports the mkcert CA
  for Node, then runs `verify-suppco.mjs`. Symlinked from `~/.local/bin/verify-suppco`.
- `verify-suppco.mjs` — the whole CLI (single ESM file). `verify-suppco help` is the flag reference.
- `verify-suppco.test.mjs` — unit tests for the argument/env layer:
  `mise exec -C ~/work/suppco/web -- node --test ~/.agents/skills/verify-suppco/verify-suppco.test.mjs`
- `features/` — the feature map (`README.md` index + one file per user-facing feature).

## Where things live

Both repos sit under `$SUPPCO_ROOT` (`~/work/suppco`). `web/` is a pnpm + Turborepo monorepo, so the checkout root and the
app you are driving are different directories; run a package's own scripts from its directory (or `pnpm --filter <name>`
from `web/`). `verify-suppco` itself runs from anywhere.

| Directory | What it is | Run from here |
|---|---|---|
| `~/work/suppco/backend` | Rails API (`api.supp.co`); also Sidekiq, `db/`, `log/development.log` | `bin/rails …`, `bundle exec rspec`, `bin/rails db:migrate` |
| `~/work/suppco/web` | monorepo root: `pnpm-workspace.yaml`, `turbo.json`, `AGENTS.md` | `pnpm install`, `pnpm --filter web <script>`, `pnpm lint`, `pnpm storybook:preview` |
| `~/work/suppco/web/apps/web` | **the web app** (SvelteKit, package `web`); also Storybook and the Capacitor iOS shell (`ios/App/App.xcworkspace`) | `pnpm dev`, `pnpm test`, `pnpm test:unit`, `pnpm check`, `pnpm storybook` (:6007), `pnpm sync:ios` |
| `~/work/suppco/web/apps/widget` | embeddable widget (`@suppco/widget`, Vite + Playwright) | `pnpm dev`, `pnpm test`, `pnpm e2e` |
| `~/work/suppco/web/apps/{cache,cloudinary,segment,sentry,discourse}-proxy` | Cloudflare Workers (wrangler) | `pnpm dev`, `pnpm deploy…` |
| `~/work/suppco/web/apps/extension` | browser extension | its own scripts |
| `~/work/suppco/web/apps/shopify-app/supp-co-subscriptions` | Shopify app, a nested pnpm workspace | `pnpm --dir … --filter <pkg> …` (see `web/AGENTS.md`) |
| `~/work/suppco/web/packages/{auth-native,browser}` | custom Capacitor plugins | `pnpm build` |
| `~/work/suppco/web/packages/eslint-config-custom` | shared ESLint config | nothing to run |
| `~/work/suppco/.verify-suppco` | this CLI's state, logs, sessions, screenshots, traces, `env/<api>.env`, and `worktrees/` | read-only for you |

After `verify-suppco up --web <branch>` / `--backend <branch>` the roots above move to `.verify-suppco/worktrees/<backend|web>/<branch>`
(and `apps/web` inside it); `verify-suppco status` → `repo` lines print the paths in effect, so read them before `cd`-ing.

## Rules

- `up` guarantees at most one managed backend and one managed web; `status` lists leftovers as `orphan`, `down` reaps them.
- Servers this CLI did not start are `foreign`: a default `up` adopts them, anything else refuses. Replace them only with
  `--takeover`, and say so.
- Prefer minted sessions (`verify-suppco login`, default on `--api local`): no email, no throttle, ~3s. Use `--real` only
  when the login flow itself is what you are testing.
- A screenshot that says `REDIRECTED` is app behaviour (auth guard, onboarding wizard, Pro gate), not a CLI failure. Read the
  final URL before concluding.
- Never edit product code to make a verification pass; a behavior the map describes that the app no longer does is either
  map drift (fix `features/`) or a product regression (report it).

## Gotchas the CLI cannot print

- `/marketplace` (Buying Club) requires an active subscription (`session.user.has_active_subscription`, rebuilt from
  `GET /api/users/me_compact` on every load, so no re-mint after `Entitlement.grant_admin`); non-members and guests are sent
  to `/`, which forwards a signed-in user to `/home/today`. Members without accepted Buying Club terms go to
  `/marketplace/welcome` first. New users (`onboarding_completed` false) are sent to the SuppScore wizard at
  `/my/suppscore/wizard/intro` on first `/home/today`.
- The passwordless limiter is 5 codes per email and 10 per IP per 30 minutes; `verify-suppco throttle clear` resets it.
- `--migrate` on the main backend clone lets Rails re-dump `db/structure.sql` and `annotaterb` rewrite models and tests, so
  `status` shows the backend dirty (`*`) afterwards; inspect `git status` there before assuming the changes are yours.
- With the placeholder credentials shim every signed-in page logs one failed `401 /api/inApp/getMessages` (Iterable) and the
  marketplace hub a `422 /api/shop/subscriptions` (Shopify); guests log `401 /api/ui_note_flags`. None is a page error.
- The dev Rails log has no request-id tags (`config.log_tags` is unset), so join `api` output to the log by path and
  time, not by `x-request-id`.
- Sidekiq shares Redis, so a job enqueued under one `--db` can run under another if two backends ever overlap; the CLI
  keeps one backend for that reason.
- Worktrees share the main clone's `.git` (`git worktree list` in `backend/` or `web/` shows them; remove with
  `git worktree remove <path>`). The main clone may itself be on a feature branch (`status` → `repo` lines).

### iOS (`verify-suppco ios`)

- The app is a Capacitor **shell**: it loads the web app from an origin fixed at `cap sync` time (dev → your
  `--tunnel` host, staging → `staging.supp.co`, prod → `app.supp.co`); the web code is never bundled, so `pnpm build`
  is not part of the loop. A device needs the tunnel host in `WKAppBoundDomains` in `Dev-Info.plist`.
- Native sign-in only works through the named **API** tunnel (`--api-tunnel`): the auth plugin rejects non-HTTPS
  authentication URLs and the backend compares the issuer host to the request host. Do not patch backend auth to
  get around it; do not reuse another developer's hostname without checking the route points at this Mac.
- A web tunnel route whose service is `https://localhost:3001` needs the mkcert CA trusted by cloudflared; a
  Cloudflare 502 saying "first record does not look like a TLS handshake" means the origin was plain http.
- The `xcode-select` fix the CLI prints is interactive (`sudo`): hand it to the human.
- `Pods/`, `App/public/` and `capacitor.config.json` are generated and gitignored; a diff in `ios/` after sync means
  something else changed.
- `terra-capacitor` is deliberately left out of `includePlugins` (HealthKit entitlements); do not re-add it to fix a build.
- In-app purchases in the simulator use the `Products.storekit` config (Edit Scheme → Run → Options); see `apps/web/README.md`.
