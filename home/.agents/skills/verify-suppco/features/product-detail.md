# Product detail page

`/products/<slug>` is the public product page: name, brand, TrustScore and quality, warnings, ingredients, FAQs; lab results appear when signed in. Buying Club members who have accepted the terms also see a "Buy on SuppCo" block (variants, subscribe or one-time, add to cart) when the product has a published shop listing. It works signed out and signed in.

## Sub-features

- `pdp-guest` a signed-out visitor sees the product page with no error boundary; the add-to-stack button leads to sign-up and the add-to-list icon to login.
- `pdp-signed-in` a signed-in user sees the same page with a working add-to-stack toggle and add-to-list drawer, plus lab results.
- `pdp-marketplace-options` a Buying Club member with terms accepted sees "Buy on SuppCo" (variants, price, subscribe/add to cart) for a product with a published, shopable listing.
- `pdp-missing` an unknown slug shows the app's 404 page ("Oops."), not a crash; an old slug listed in `redirect_slugs` 301s to the current one.

## How to get to it (user POV)

- Search or browse `/products`, `/products/popular`, `/products/search/<query>` or a brand page `/brands/<slug>` and choose a product.
- Scan a barcode in the app: `/products/upc/<upc>` redirects to the product page.
- Visit `/products/<slug>` directly.

## Driving it with verify-suppco

Preconditions:

- `verify-suppco up --api local --db <db>` is healthy and the database has products: `verify-suppco sql "select count(*) from products"` (README → `api_prod_mirror` is empty until pulled; `api_staging_mirror` has the catalog).
- Pick a slug and a UPC: `verify-suppco sql "select upc, slug from products where upc is not null and slug is not null and length(upc) between 8 and 14 order by id limit 1"`.
- For the member block, a club product: `verify-suppco sql "select p.slug from products p join shop_listings sl on sl.product_id = p.id where sl.published and sl.shopify_product_id is not null limit 1"` and a member per [marketplace](./marketplace.md). Zero rows means the block is unreachable on this database.

- **Guest.** Run `verify-suppco shot /products/<slug> --full`. Final URL is the same route, title "<product> | SuppCo", `0 page errors`.
- **Signed in.** Run `verify-suppco shot /products/<slug> --as kevin.pruett@supp.co --full`. Same URL; the request list includes `GET /api/products/<slug>` and `GET /api/shop/products/<slug>/marketplace_info` (a 404 "Product not available" there is expected for a non-club product).
- **API.** `verify-suppco api GET /api/products/<slug>` is 200 with or without `--as`; `verify-suppco api GET /api/products/does-not-exist-xyz` is 404 with an empty body.
- **Member options.** Run `verify-suppco shot /products/<club-slug> --as qa-member@supp.co --full`; the "Buy on SuppCo" block is visible and `verify-suppco api GET /api/shop/products/<club-slug> --as qa-member@supp.co` returns the `variants` shown.
- **Missing slug.** Run `verify-suppco shot /products/does-not-exist-xyz`. The sidecar's status is 404, title "Oops. - SuppCo", `errorPage: false`, `0 page errors`. The shot exits 1 because the final status is ≥ 400, not because of an error boundary; that exit is the expected result here.
- **Barcode.** Run `verify-suppco shot /products/upc/<upc>`. `REDIRECTED` to `/products/<slug>`.
- **Proof.** The guest and signed-in `--full` PNGs and sidecars, the 404 sidecar, the UPC redirect sidecar, and the `api` outputs.

## Gotchas

- Product pages are heavy (600+ requests); the first load on a cold local backend can exceed the sidecar's slow-request threshold without being a bug.
- The guest page logs one failed `401 /api/ui_note_flags` (the app layout asks for note flags even when signed out); not a page error.
- "Buy on SuppCo" needs membership **and** accepted terms **and** a shop listing that is published with a `shopify_product_id`; a plain product shows no block for anyone. The staging mirror has no `shop_listings` at all; the prod mirror has them only when a `db pull` included that table, so run the club-product query before planning this step.
- The "$ / 100mg" normalized-unit price row is not on the product page; it renders only in the Stack Switcher comparison at `/my/marketplace/compare`.
- Slugs in a mirror are real; do not mutate product rows without restoring them.
