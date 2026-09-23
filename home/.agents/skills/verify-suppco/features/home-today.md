# Home today

`/home/today` is the signed-in landing page (title "Home"): one scrolling column under a "Today | Community" tab bar with a stack card (or an "Add your products to unlock insights" prompt), the Buying Club module for members, Community Posts, Featured Articles, protocol recommendations, nudges ("See supplement ratings", "Build and manage your Stack") and a "Give feedback" card. Which modules appear depends on the user's data. A brand-new user is sent through the SuppScore wizard before seeing it.

## Sub-features

- `home-render` a returning user sees the today page with its modules and no error boundary.
- `home-wizard-redirect` a user whose `onboarding_completed` is false is redirected once to `/my/suppscore/wizard/intro` (Function members: `/onboarding/function-welcome`); the flag is set to true on that visit.
- `home-buying-club-module` members see the Buying Club module ("Members can now buy directly on SuppCo" before their first order, a rewards card after); non-members see no Buying Club module at all.
- `home-guest-guard` signed-out visitors never see `/home/today`.

## How to get to it (user POV)

- Sign in; the app lands on `/home/today` (`/` and `/home` also forward a signed-in user there).
- Tap the Home tab in the footer nav from any signed-in route.
- Visit `/home/today` directly.

## Driving it with verify-suppco

Preconditions:

- `verify-suppco up --api local --db <db> --as kevin.pruett@supp.co` is healthy. A user the database has never seen is created with `onboarding_completed = false`, so the first shot is the wizard redirect and the second is the page.
- For the member module, a member per [marketplace](./marketplace.md) (`qa-member@supp.co`) with the welcome note flags set (that recipe sets them).

- **New-user redirect.** Run `verify-suppco shot /home/today --as kevin.pruett@supp.co` right after minting. The sidecar reports `REDIRECTED` to `/my/suppscore/wizard/intro` and lists a `PUT /api/users/me`. Confirm with `verify-suppco sql "select onboarding_completed from users where email='kevin.pruett@supp.co'"` → `t`. To repeat: `verify-suppco rails 'User.find_by!(email: "kevin.pruett@supp.co").update!(onboarding_completed: false)'`.
- **Returning user.** Run `verify-suppco shot /home/today --as kevin.pruett@supp.co --full`. Final URL `/home/today`, title "Home - SuppCo", `0 page errors`.
- **Guest guard.** Run `verify-suppco shot /home/today`. `REDIRECTED`; the final URL is the Rails `/auth/login?…` page (see [session-login](./session-login.md)).
- **Module presence.** Write a Playwright script that visits `/home/today` and returns the `h1/h2/h3` texts; run `verify-suppco pw home-modules.mjs --as qa-member@supp.co` and again `--as kevin.pruett@supp.co`. The member's list contains "Members can now buy directly on SuppCo"; the non-member's does not. Both contain "Community Posts".
- **Proof.** The `--full` PNG plus sidecar for the returning user, the redirect sidecar for the new user, and the two heading lists.

## Gotchas

- The page is not dated, but it is time-dependent ("Big Day" banner from an env var, campaign cards that expire); do not assert exact copy that a campaign controls.
- Modules load from several API calls (`users/me_compact`, `documents/carousel`, `topics/user_posts`, `protocols/recommended`, `journey_sessions`, `shop/orders` for members); a slow local backend shows skeletons. Read `failed`/`slow` requests in the sidecar before calling a blank module a bug.
- Every signed-in load shows one failed `401 /api/inApp/getMessages` (Iterable) while the backend runs on the placeholder credentials shim; environment noise, not a page error.
- "Featured Articles" is empty when the database has no `documents`; `--db dev` has little content anywhere. Prefer a mirror with catalog data (README → `--db prod` vs `staging`).
- New members are auto-sent once from `/home/today` to `/marketplace/welcome` (note flag `dialog.bc-alpha-ftue-autoopen-v1`); the marketplace recipe sets it so the member's home shot stays on `/home/today`.
