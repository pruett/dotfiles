---
name: verify-suppco
description: Drive the SuppCo app from the terminal with the `verify-suppco` CLI. Use when asked to boot or stop the app locally, run the local web against staging or prod data, log in as a user, screenshot a route, run a Playwright script as a user, or prove user-facing behavior end to end.
---

# verify-suppco

`verify-suppco` is on `PATH` and its `--help` is the whole contract. Before the first command of a session run
`verify-suppco --help`, then `verify-suppco <verb> --help` for each verb you will use, and follow them literally.
Every non-zero exit prints a `fix:` line; run it verbatim before anything else.

What `--help` cannot tell you:

- Local `shot.json` always lists Vite HMR websocket console errors. That is noise, not a failure of the route.
