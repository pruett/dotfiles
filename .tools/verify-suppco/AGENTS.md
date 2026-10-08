# verify-suppco (v1) — layout and contract

This directory is the CLI project, kept out of the stowed `home/` package (root dot-directories are never stowed).
`home/.local/bin/verify-suppco` is a relative symlink to `bin/verify-suppco` here, so Stow puts it on `PATH`; the agent-facing
prose is the separate skill `home/.agents/skills/verify-suppco/` (its `references/cli-api.md` symlinks this README, so it reads the generated `--help` blocks).

`src/help.mjs` is the source of truth for everything the CLI can do: edit it whenever a verb gains or changes behavior.
`README.md`'s fenced blocks are generated from it (`node scripts/gen-readme.mjs`); `test/help.test.mjs` fails if the
README or any verb's `--help` output drifts from it.

- `bin/verify-suppco` — bash shim: runs `src/cli.mjs` with the web checkout's Node via `mise exec -C $SUPPCO_ROOT/web`,
  exports the mkcert CA as `NODE_EXTRA_CA_CERTS`.
- `src/cli.mjs` — dispatcher. Loads `src/verbs/<verb>.mjs`, prints `error: …` + `fix: …` on stderr for `CliError`.
- `src/lib.mjs` — everything shared: `fail(code, msg, fix)`, `parseArgs`, `resolveRoot`/`paths`, `resolveTargets`,
  `credentials`, `readAuth`/`writeAuth`, `newRunDir`, `playwright(P)`, `webEnvFor`, `spawnDetached`, `httpStatus`,
  `waitFor`, `webHealthy`/`apiHealthy`.
- `src/verbs/{doctor,up,down,login,pw,shot}.mjs` — one file per verb, `export default async (argv, ctx) => exitCode`.
- `test/` — `node --test` (or `pnpm test`).
- `examples/` — Playwright scripts for `pw`.

State lives under `$SUPPCO_ROOT/.verify-suppco/` (default `~/work/suppco/.verify-suppco/`; `$VERIFY_SUPPCO_STATE`
relocates it): `auth/<email>.json`, `runs/<stamp>-<verb>-<slug>/`, `logs/`, `up.json`, `worktrees/`.

Rules: stdout is the verb's result only. Never echo `$PLAYWRIGHT_CODE`. Exit 0/1/2 per the README. A verb edits only its
own file; shared helpers go in `lib.mjs` as additive exports.

## `pw` script contract (shared by `src/verbs/pw.mjs` and `examples/`)

The script's default export is called once: `async ({ page, context, base, auth, args, shots }) => result`.
- `page` / `context` — a Playwright page and its context, `baseURL` set to the web target, session injected when `--as` resolved.
- `base` — the web target URL string (e.g. `https://localhost:3001`), no trailing slash.
- `auth` — the parsed `auth/<email>.json` record (`{ email, web, api, savedAt, expiresAt }`, no storageState) or `null` for guest.
- `args` — the strings after `--`.
- `shots(name)` — `async`: saves `shots/<name>.png` in the run directory and returns its absolute path.
`result` is JSON-serialised to stdout (strings printed as-is). Thrown error → exit 1 with the message on stderr.

## Inputs and state (ephemeral by design)

Every input is a flag or an environment variable; `doctor` prints one line per variable and `.env.example` lists them
(`test/env-example.test.mjs` fails when a new `process.env` read is missing there). Shell exports win (this Mac:
`~/.config/zsh/extras/.zshrc.local.zsh`); `src/cli.mjs` loads `$VERIFY_SUPPCO_ENV` or the gitignored `.env` here as
the fallback. Nothing is read from the checkouts' `.env` files and nothing is written to them.
`up` hands Vite its complete environment (`webEnvFor`), so a web clone with no `.env.local` boots. With `--web <url>` no
checkout is needed at all: Playwright resolves from this directory's `node_modules`, and `$SUPPCO_ROOT` may be an empty
temp dir. `.verify-suppco/` under the root is a cache (sessions, runs, logs, up.json) that can be deleted at any time.
