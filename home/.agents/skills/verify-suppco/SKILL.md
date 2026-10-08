---
name: verify-suppco
description: Boot and drive the SuppCo app (Rails backend + SvelteKit web) from the terminal with the `verify-suppco` CLI. Use when asked to boot, run or stop the app locally, run the web app against production or staging data, log in as a user, screenshot a route, run a Playwright script as a user, or prove user-facing behavior end to end. Turns the request into `verify-suppco` commands.
---

# verify-suppco

`verify-suppco` is a six-verb CLI on `PATH`: `doctor`, `up`, `down`, `login`, `pw`, `shot`. Its `--help` is the
source of truth for everything it can do: [`references/cli-api.md`](references/cli-api.md) is every verb's `--help` in one
file. Read it once per session before the first command; this file only adds recipes and gotchas, never capabilities.

The code lives in `~/.dotfiles/.tools/verify-suppco/` (`src/`, `test/`, `examples/`, `scripts/e2e.sh`); change the
CLI there, following its `AGENTS.md`. This skill is prose only.

## Targets and inputs

- `--web` and `--api` are repeated on every verb and never persisted. Each is `local`, `staging`, `prod`, or a URL
  (`--api` also takes a backend branch name on `up`). Default is `local` for both. Remote targets boot nothing.
- Every input is a flag or an environment variable; `verify-suppco doctor` lists and checks the variables. They are
  exported from `~/.config/zsh/extras/.zshrc.local.zsh` on this Mac (the CLI's own `.env` is the fallback elsewhere).
  Nothing is read from or written to the checkouts' `.env` files; `up` hands Vite its whole environment.
- `$VERIFY_SUPPCO_ROOT` (default `~/work/suppco`) holds `backend/` and `web/`. Sessions, run output, logs and `up.json` live
  under `$VERIFY_SUPPCO_ROOT/.verify-suppco/` (`$VERIFY_SUPPCO_STATE` relocates it), a cache that can be deleted at any time.
  A run directory is `runs/<stamp>-<verb>-<slug>/`.
- With `--web <url>` no checkout is needed: `VERIFY_SUPPCO_ROOT=$(mktemp -d)` works, and Playwright resolves from the
  CLI's own `node_modules`.

## Recipes

1. **Local end to end**: `doctor`, `up`, `login`, then `shot <route> --as <email>` or `pw <script> --as <email>`,
   then `down`. Pass the same `--web`/`--api` to every step.
2. **Local web on production data** (the usual demo path, no local backend needed):
   `up --web local --api prod`, then `login`, `shot`, `pw` with `--web local --api prod`.
3. **Pure remote, no checkout**: `VERIFY_SUPPCO_ROOT=$(mktemp -d) verify-suppco login --web https://supp.co --api prod`, then
   `shot`/`pw` with the same root and targets.
4. **Prove the whole chain**: `scripts/e2e.sh` in the project runs doctor, up, login, shot, pw, down and prints a
   pass/fail table (`E2E_API=prod` for recipe 2, `E2E_KEEP=1` to leave servers up).

`login` is required before any `--as <email>`; a missing session exits 2 with the exact `login` to run. Bypass
accounts (any `*test@monsterinbox.com` on local and staging, allow-listed accounts on prod) take the fixed
`$VERIFY_SUPPCO_CODE` headlessly; anything else needs a human at a headed browser.

## Reading results

- stdout is the verb's result only; everything else, including the run directory path, is stderr.
- `shot` writes `shot.png` and `shot.json` (final url, redirect, status, title, console errors, failed requests) to its
  run directory. Exit 1 means an error page or status 400+.
- `pw` prints the script's returned value (JSON, strings as-is). `--trace` and `--video` land in the run directory.
  A script is an ES module whose default export is called once:
  `async ({ page, context, base, auth, args, shots }) => result`. `page` has `baseURL` set and the session injected;
  `base` is the web URL; `auth` is the saved session record or `null` for guest; `args` are the strings after `--`;
  `await shots('name')` saves `shots/name.png` in the run directory. Start from `examples/` in the project.
- Every non-zero exit prints `error: …` and one `fix: <command>` line on stderr. Run the fix verbatim before trying
  anything else; exit 2 is a precondition (nothing booted, no session, checkout missing), exit 1 is the drive failing.

## Gotchas

- `login --api local` rejected with "verify that you are human": the backend runs on placeholder Rails credentials.
  `doctor` and `login` print the `master.key` fix; the key is Heroku's `RAILS_MASTER_KEY`, not in 1Password.
- Local `shot.json` always lists Vite HMR websocket console errors (the app pins `hmr.clientPort` to 443 for tunnels).
  That is noise, not a failure of the route.
- Vite's `:3001` certificate is signed by `~/.vite-plugin-mkcert/rootCA.pem`, not `mkcert -CAROOT`. The `bin` shim
  bundles both into `NODE_EXTRA_CA_CERTS`; a raw `node src/cli.mjs` will fail TLS against local web.
- Non-bypass emails hit the login rate limiter at 5 codes per 30 minutes.
