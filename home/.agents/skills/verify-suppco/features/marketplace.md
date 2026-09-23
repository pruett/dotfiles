# Marketplace (Buying Club)

`/marketplace` (title "Buying Club") is the storefront for members: search, stack/nutrient/goal carousels, a credits explainer and a brand carousel. Anyone without an active membership, signed in or not, is bounced to the front door `/` (which forwards a signed-in user to `/home/today`). A member who has not accepted the current Buying Club terms, or has not dismissed the welcome note, is sent through `/marketplace/welcome` first.

## Sub-features

- `market-gate` a signed-in non-member visiting `/marketplace` ends on `/home/today` (via `/`); a guest ends on `/`.
- `market-member` a member with terms accepted and the welcome dismissed sees the hub with the credits module and brand carousel.
- `market-welcome` a member without accepted terms (or with the welcome note still pending) is redirected to `/marketplace/welcome`; accepting the terms grants a $5 welcome credit.
- `market-browse` `/marketplace/brands`, `/marketplace/by-goal`, `/marketplace/category/<slug>`, `/marketplace/goals/<slug>`, `/marketplace/search/<slug>` and `/marketplace/popular` render for members.
- `market-my` `/my/marketplace/{cart,orders,subscriptions,rewards,compare,stack,nutrients,confirmation}` are reachable for members (guests go to login).

## How to get to it (user POV)

- Tap the "Club" tab in the footer nav, or the Buying Club module on `/home/today`.
- Visit `/marketplace` directly.
- From a product page, open the "Buy on SuppCo" block (members only, club products only).

## Driving it with verify-suppco

Preconditions:

- `verify-suppco up --api local --db <db>` is healthy.
- A non-member: any freshly minted user (`verify-suppco login kevin.pruett@supp.co`).
- A member: `verify-suppco login qa-member@supp.co`, then grant membership locally:
  `verify-suppco rails 'Entitlement.grant_admin(User.find_by!(email: "qa-member@supp.co"))'` and confirm with
  `verify-suppco api GET /api/users/me_compact --as qa-member@supp.co` that `has_active_subscription` is `true`. No re-mint is needed: the web app rebuilds `session.user` from that endpoint on every load.
- A published Buying Club terms document: `verify-suppco rails 'p TermsDocument.current_published("buying_club")&.version'`. The local mirrors have none (`terms_documents` is not pulled), so create one for the run:
  `verify-suppco rails 'TermsDocument.create!(tos_type: "buying_club", version: "local-verify", effective_date: Date.current, title: "Buying Club Terms (local)", body: "local")'` and delete it and its `terms_consents` when done.

- **Non-member gate.** Run `verify-suppco shot /marketplace --as kevin.pruett@supp.co`. `REDIRECTED`, final URL `/home/today`. Without `--as`: final URL `/`.
- **Welcome redirect.** Run `verify-suppco shot /marketplace --as qa-member@supp.co`. `REDIRECTED` to `/marketplace/welcome` ("Welcome to the Buying Club").
- **Accept terms.** Run `verify-suppco api POST /api/terms/accept --as qa-member@supp.co --json '{"tos_type":"buying_club"}' --expect 201`, then dismiss the welcome notes:
  `verify-suppco rails 'u = User.find_by!(email: "qa-member@supp.co"); UiNoteFlag.upsert_merge_data_for_user!(user: u, patch_data: {"dialog.marketplace-welcome-v1" => true, "dialog.bc-alpha-ftue-autoopen-v1" => true})'`. `api GET /api/users/me_compact` now shows `buying_club_terms_accepted: true`. (To drive the welcome UI itself, run a `verify-suppco pw … --as qa-member@supp.co --trace` script that taps through the slides, agrees, and clicks "Get Started".)
- **Member page.** Run `verify-suppco shot /marketplace --as qa-member@supp.co --full`. Final URL `/marketplace`, title "Buying Club - SuppCo".
- **Browse.** Run `verify-suppco shot /marketplace/brands --as qa-member@supp.co`, `… /marketplace/by-goal …`, `… /my/marketplace/orders …`, `… /my/marketplace/cart …`. All 200, none `ERROR PAGE`.
- **Credit.** `verify-suppco api GET /api/shop/wallet/balance --as qa-member@supp.co` returns `"balance": "5.0"` (the welcome credit), computed in the request.
- **Proof.** The member `--full` PNG and sidecar, the non-member and welcome redirect sidecars, and the `api` outputs for `me_compact` and the wallet.

## Gotchas

- Membership is `has_active_subscription` = `users.pro_until > now`, kept current by Entitlement callbacks; `Entitlement.grant_admin` sets it and joins the Buying Club but does **not** accept the terms.
- `Entitlement.grant_admin` is a local shortcut for verification only; never run it against a remote API.
- `POST /api/terms/accept` returns 422 when no published `buying_club` terms document exists; that is the mirror's data, not a bug.
- The hub's credits module is a static explainer; wallet data comes from `/api/shop/wallet/balance` and `/transactions`, computed synchronously (no Sidekiq wait).
- On the hub the sidecar shows one failed `422 /api/shop/subscriptions` while the backend runs on the credentials shim (no Shopify); environment noise.
