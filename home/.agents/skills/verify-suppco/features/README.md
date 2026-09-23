# SuppCo verification map

This directory is the maintained source for verifying the user-facing behavior of the SuppCo web app (SvelteKit on
`https://localhost:3001`, Rails API on `http://localhost:3000`). Read this index before driving the app, then use the
matching feature file as the recipe. Seeded 2026-09-23 from the top routes and proven live the same day;
`/maintain-verification-skill` keeps it honest.

## Baseline preconditions

- `verify-suppco doctor` is green for toolchain, Postgres, Redis, mkcert CA, `.env.local`, the checkouts in effect, and the
  database you will use.
- Launch with `verify-suppco up --api local --db <db> --web web --backend backend --as kevin.pruett@supp.co` (local Rails on a
  local database; users are never pulled, so the minted session creates or reuses a local user). Pick `<db>` by data:
  `verify-suppco sql "select count(*) from products"` after `up`. `--db prod` (`api_prod_mirror`) holds only what
  `verify-suppco db pull --db prod` has pulled and can be empty; `--db staging` (`api_staging_mirror`) has the catalog but no
  `shop_listings` or `terms_documents`; `--db dev` is the seeded `api_development` with little data.
- A mirror behind `main`'s migrations stops `up`; `--migrate` applies them to that local database (it also lets Rails and
  `annotaterb` rewrite `db/structure.sql`, models and tests in the backend clone; check `git status` there afterwards).
- Never drive a server this run did not start or adopt through `verify-suppco up`; `status` marks others `foreign`.
- Every recipe's user is a minted session (`verify-suppco login <email>`), bound to the `--db` it was minted against; re-mint
  after changing databases. Use `--real` only in the login feature itself.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Routes are the stable handles: `/home/today`, `/marketplace`, `/products/<slug>`, `/logout`. The signed-out guard ends on the
  Rails login page `http://localhost:3000/auth/login?…`, not on the web `/login`. Prefer ARIA roles and visible text in
  Playwright scripts over CSS classes.
- Treat every command as literal. Keep quoted flags unchanged.
- Browser actions: `verify-suppco shot <route> --as <email>` for a single state, `verify-suppco pw <script.mjs> --as <email>`
  for a multi-step flow (the script exports `default async ({ page, context, browser, base, api, auth, args }) => result`).
  API calls: `verify-suppco api <METHOD> </api/path> --as <email>`. Data: `verify-suppco sql` / `verify-suppco rails`.
- Restore any data a recipe mutates (`rails`/`sql`). Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen: the `shot` sidecar JSON (final URL, console
  errors, failed requests) is part of the proof.
- A mutation is proved by a read-only second view (`verify-suppco sql '<select>'` or `api GET`).
- Record the feature ID and the entry point used with every artifact; artifacts live in `.verify-suppco/shots` and
  `.verify-suppco/traces`.
- Report an unreachable path with the command attempted and the unmet precondition (auth, entitlement, data). A
  `REDIRECTED` shot is app behavior; report the final URL and whether the map predicted it.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly
four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-suppco`
(starting with `Preconditions:`), and `Gotchas`. Keep implementation details out of the map.

## Features

- [Session and login](./session-login.md) covers minted sessions, the real passwordless email-code login (Rails `/auth/…` pages), the 5-per-30-minutes throttle, and logout.
- [Home today](./home-today.md) covers the signed-in landing page, the one-time SuppScore wizard redirect, and the members-only Buying Club module.
- [Marketplace (Buying Club)](./marketplace.md) covers the membership gate, the terms/welcome flow, the hub for members, and the browse and `/my/marketplace` routes.
- [Product detail page](./product-detail.md) covers a public product page as guest and as a signed-in user, the 404 and UPC redirect, and the Buying Club options block for members.
