# Session and login

A user signs in with a passwordless email code. The web app's `/login` page has no form of its own: it starts an OAuth sign-in against the Rails app, which shows the email form at `http://localhost:3000/auth/login`, emails a 6-digit code (valid 30 minutes; locally it lands in `letter_opener`) and checks it. The user then lands on `/home/today` (or the `sendTo` path) and API calls carry their session. For verification the CLI mints that session directly against the local backend.

## Sub-features

- `session-mint` a minted session for any email works without touching the email flow (the user is created in the local database if missing).
- `session-real` the real flow accepts an email on the Rails login page, sends a code, and signs the user in after the code is entered.
- `session-throttle` code requests are rate limited (Rack::Attack: 5 per email and 10 per IP per 30 minutes) and the limiter can be reset.
- `session-api` API calls made as the user return that user's data; unauthenticated calls to private endpoints get 401.
- `session-logout` `/logout` drops the web session cookie and the Rails session, then lands on the public landing page `/`.

## How to get to it (user POV)

- Open any private route (for example `/home/today`) while signed out; the app sends you to `/login?sendTo=<path>`, which immediately continues to the Rails login page (`/auth/login?client_id=web-client…`, titled "SuppCo Login").
- Type an email there; the code arrives by email (locally: `letter_opener`; `verify-suppco code --wait` reads it).
- After the code, you land on the `sendTo` path, or `/home/today` by default.
- Visit `/logout` to sign out; you land on `/`.

## Driving it with verify-suppco

Preconditions:

- `verify-suppco up --api local --db <db>` is healthy (`status` shows backend and web `up`). Minted sessions are per database: `login` again after changing `--db`.
- No session yet for the test email, or you accept overwriting it.

- **Mint.** Run `verify-suppco login qa-session@supp.co`. It prints `.verify-suppco/auth/qa-session@supp.co.json` (a new user is created, role `customer`) and `status` lists the session as `minted … fresh`.
- **Use it.** Run `verify-suppco api GET /api/users/me_compact --as qa-session@supp.co`: 200 with `has_active_subscription`, `onboarding_completed` and `buying_club_terms_accepted` for that user. This is the endpoint the web app builds `session.user` from on every page load. Without `--as` the same call is 401 `Bad credentials`.
- **Signed-out guard.** Run `verify-suppco shot /home/today` (no `--as`). The sidecar reports `REDIRECTED` and the final URL is `http://localhost:3000/auth/login?client_id=web-client&…`.
- **Real flow.** Run `verify-suppco login qa-real@supp.co --real`. Against `--api local` it is fully headless: the CLI fills the email on the Rails page, waits for the Turnstile test key to pass, reads the code from `letter_opener` and submits it. `status` shows the session as `real … fresh`.
- **Throttle.** Write a Playwright script that opens `/login?login=true`, fills the email on the Rails page and submits, in a fresh browser context per attempt; run it for six attempts (`verify-suppco pw throttle.mjs --trace qa-throttle@supp.co 6`). Attempts 1–5 land on `/auth/code`; the sixth lands on `/auth/request_code` with the heading "Too many attempts". Run `verify-suppco throttle clear`; the next request succeeds.
- **Logout.** Run `verify-suppco shot /logout --as qa-session@supp.co`: `REDIRECTED` to `/` (one `GET /auth/logout` in the request list). Then run `verify-suppco shot /home/today --as qa-session@supp.co` with the same minted file: it lands on `/home/today` (or the wizard for a new user), because a minted file carries its own token and `/logout` does not revoke it.
- **Proof.** The guard sidecar, the throttle trace, the two logout shots, and the `status` output naming the sessions.

## Gotchas

- `/login` never shows a form; the email and code screens are Rails pages on `http://localhost:3000/auth/…`. Assert on that origin, not on `/login`.
- Minted sessions default to 24 hours; `status` marks older ones `stale`, and `login` again re-mints. A minted file is bound to the `--db` it was minted against.
- The limiter is 5 codes per email and 10 per IP per 30 minutes (`config/initializers/rack_attack.rb`), counted in the Redis that `REDIS_URL` points at (default db 1); `throttle clear` is the only reset, and `login --real` runs it first.
- `--api prod|staging` cannot mint: login there is the real browser flow against the remote API, completed by hand.
- A user with `onboarding_completed = false` is a brand-new user: the first `/home/today` redirects to the SuppScore wizard (see [home-today](./home-today.md)).
