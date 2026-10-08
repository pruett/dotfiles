Example Playwright scripts for `verify-suppco pw` (see AGENTS.md for the script contract).

- `title.mjs`: `verify-suppco pw examples/title.mjs` prints `{ url, title }` for `/` (guest, or add `--as <email>`).
- `click-around.mjs`: `verify-suppco pw examples/click-around.mjs --as <email> [--trace]` clicks through primary nav links.
- Screenshots land in the run directory under `.verify-suppco/runs/`; stdout is the returned JSON.
- Add `--headed` to watch; target flags (`--web`, `--api`) apply as on every verb.
- Credentials (`PLAYWRIGHT_EMAIL`, `PLAYWRIGHT_CODE`) come from the environment (`verify-suppco doctor` checks them).
