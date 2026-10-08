# verify-suppco v1

Boot and drive the SuppCo app for automated verification. Six verbs. `--help` is the contract and the source of
truth for everything the CLI can do: a skill or agent reads it and proceeds. It lives in `src/help.mjs`; the blocks
below are generated from it by `node scripts/gen-readme.mjs` and tested for drift, so read them as `--help` output.

```
verify-suppco <verb> [<subverb>] [<args>...] [<flags>]
```

## Conventions

- Exit `0` ok · `1` the check or drive failed · `2` usage or missing precondition.
- Every non-zero exit prints one `fix: <command>` line on stderr.
- stdout is the verb's result. Everything else is stderr.
- Targets are flags, repeated on every verb. Nothing persists between invocations except sessions and run output.
- Every input is a flag or an environment variable; `verify-suppco doctor` lists the variables and checks them. Shell exports win (on this Mac they live in `~/.config/zsh/extras/.zshrc.local.zsh`); the CLI's own `.env` ([`.env.example`](.env.example)) is the fallback for a machine without them. A flag wins over the variable. Nothing is read from, or written to, the checkouts.
- Portable: this directory plus Node 22, `pnpm install && pnpm exec playwright install chromium` and those variables drives any remote target from any machine; only `up` and `local` targets need the checkouts. State lives under `$VERIFY_SUPPCO_ROOT/.verify-suppco/` (`$VERIFY_SUPPCO_STATE` relocates it).

## `verify-suppco --help`

```
verify-suppco — boot and drive the SuppCo app for automated verification

usage: verify-suppco <verb> [<subverb>] [<args>...] [<flags>]

  doctor                   check tools and checkouts; print fixes
  up                       boot the local web and/or backend, wait for health
  down                     stop what up started
  login [<email>]          sign in through the browser, save the session
  pw <script.mjs>          run a Playwright script against a target as a user
  shot <route>             screenshot a route as a user

targets (on up, login, pw, shot):
  --web local|staging|prod|<url>    where the browser goes          [local]
  --api local|staging|prod|<url>    what the web talks to           [local]

how it drives:
  login, pw and shot launch Chromium through Playwright. login is headless when a
  code is known, headed otherwise. shot is always headless. pw is headless unless
  --headed. up and down never open a browser.

conventions:
  exit 0 ok · 1 the check or drive failed · 2 usage or missing precondition
  every non-zero exit prints one `fix: <command>` line on stderr
  stdout is the verb's result; everything else (progress, run paths) is stderr
  targets are never persisted; repeat --web/--api on every verb
  every input is a flag or an environment variable (verify-suppco doctor lists them); shell
  exports win, the CLI's own .env is the fallback. nothing is read from the checkouts
  state lives under $VERIFY_SUPPCO_ROOT/.verify-suppco/ ($VERIFY_SUPPCO_STATE to relocate): auth/,
  runs/, logs/, up.json; safe to delete

run `verify-suppco <verb> --help` for a verb's flags, output and exit codes
```

## `verify-suppco doctor --help`

```
usage: verify-suppco doctor [--root <dir>]

  one line per prerequisite: node/pnpm/ruby via mise, backend/ and web/ checkouts,
  rails credentials, postgres, redis, mkcert CA, playwright browsers, and one line per
  environment variable: $VERIFY_SUPPCO_ROOT, $VERIFY_SUPPCO_EMAIL, $VERIFY_SUPPCO_CODE,
  $VERIFY_SUPPCO_OAUTH_SECRET_PROD, $VERIFY_SUPPCO_OAUTH_SECRET_STAGING, $VERIFY_SUPPCO_AUTH_SECRET (shell exports,
  then the CLI's .env). each failing line ends with its fix. environment lines warn,
  they do not fail: a human can still type the code.

  --root <dir>             directory holding backend/ and web/      [~/work/suppco]

  exit 1 if any line fails. read-only; touches no network.
```

## `verify-suppco up --help`

```
usage: verify-suppco up [--web local|<branch>] [--api local|<branch>] [--root <dir>]

  boots Rails on :3000 when --api is local, Vite on :3001 when --web is local,
  then waits for health. always a fresh instance: whatever already listens on a
  port it needs is stopped first, servers it started and foreign ones alike.
  remote targets (staging, prod, <url>) boot nothing; the local web is pointed at
  the remote api (needs $VERIFY_SUPPCO_OAUTH_SECRET_PROD / _STAGING in the environment or .env).

  --web local|<branch>     web checkout: the main clone, or a branch       [local]
  --api local|<branch>     backend checkout                                 [local]
  --root <dir>             directory holding backend/ and web/      [~/work/suppco]

  a branch name checks out a git worktree under .verify-suppco/worktrees/ and
  copies the main clone's untracked essentials (.env, master.key) into it.

  prints: the two urls, pids, and log paths (.verify-suppco/logs/<service>.log)
  exit 2: checkout missing · migrations pending · a port could not be freed
```

## `verify-suppco down --help`

```
usage: verify-suppco down

  stops the process groups up started. never kills by name or port.
  prints: what it stopped. exit 0 when nothing was running.
```

## `verify-suppco login --help`

```
usage: verify-suppco login [<email>] [--code <n>] [--web ...] [--api ...]

  drives the passwordless login in Chromium and saves the session to
  .verify-suppco/auth/<email>.json for pw and shot to reuse.

  <email>                  defaults to $VERIFY_SUPPCO_EMAIL
  --code <n>               defaults to $VERIFY_SUPPCO_CODE
                           with neither: headed browser, a human types the code

  credentials are the only values read from the environment. a flag wins over
  the variable. the code is never echoed or written to a run directory.

  headless (a code is known): the Turnstile widget is mocked and the code is
  submitted unattended. headed (no code): the real Turnstile loads, the email is
  submitted once it passes, then the human types the emailed code; up to 10 min.

  bypass accounts take the fixed code headlessly: on local and staging any email
  ending test@monsterinbox.com; on prod only the backend's allow-list
  (supptest@monsterinbox.com), never another admin. every other account needs the
  headed flow and hits the rate limiter at 5 codes per 30 minutes.

  prints: email, target, expiry
  exit 1: the login page rejected the email or code
  exit 2: --web local but nothing runs on :3001 (fix: verify-suppco up)
          no email given and $VERIFY_SUPPCO_EMAIL unset
```

## `verify-suppco pw --help`

```
usage: verify-suppco pw <script.mjs> [--as <email>] [--web ...] [--api ...]
                        [--headed] [--trace] [--video] [-- <args>...]

  imports the script and calls its default export once:
    async ({ page, context, base, auth, args, shots }) => result
  page/context are Playwright's, baseURL set to --web, session injected for --as.
  base is the web url. auth is the saved session record or null for guest.
  await shots('name') saves shots/name.png in the run directory.
  stdout is the returned result (strings as-is, else JSON). everything else is stderr.

  --as <email>             session to inject             [$VERIFY_SUPPCO_EMAIL, else guest]
                           must exist (fix: verify-suppco login <email>)
  --headed                 visible browser; otherwise headless
  --trace / --video        save a Playwright trace / webm in the run directory
                           open a trace with: npx playwright show-trace <run>/trace.zip
  -- <args>...             passed to the script as `args`

  examples in ~/.dotfiles/.tools/verify-suppco/examples/:
    title.mjs              goto / and return { url, title }
    click-around.mjs       click the primary nav links, screenshot each

  writes: .verify-suppco/runs/<stamp>-pw-<script>/ (run.json, trace.zip, video.webm, shots/)
  exit 1: the script threw      exit 2: no session for --as · script not found
```

## `verify-suppco shot --help`

```
usage: verify-suppco shot <route> [--as <email>] [--web ...] [--api ...]
                          [--viewport <WxH>] [--full] [--selector <css>]

  opens <route> in headless Chromium, waits for network idle, saves shot.png and
  shot.json (final url, redirected, status, title, console errors, failed requests).
  <route> is a path on --web, or a full url.

  --as <email>             session to inject             [$VERIFY_SUPPCO_EMAIL, else guest]
  --viewport <WxH>         default 1280x900
  --full                   full page
  --selector <css>         wait for this element first

  prints: the run directory
  writes: .verify-suppco/runs/<stamp>-shot-<route>/
  exit 1: error page or status >= 400      exit 2: no session for --as
```

## Deferred past v1

`user`, `products`, `api`, `rails`, `sql`, `jobs`, `feature`, `report`, `smoke`, `db`, `ios`, `--json`, minted
sessions, target persistence. Each adds a verb or flag without changing the six above.
