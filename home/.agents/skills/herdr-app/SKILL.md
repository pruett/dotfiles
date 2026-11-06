---
name: herdr-app
description: "Control the Herdr Mac app (`herdr-app`) and its terminal core (`hc`). Use only when the user mentions Herdr, or asks to inspect or control its spaces, tabs, panes, terminals, or another agent running in one. Requires HC_TERMINAL_ID."
---

# Herdr app

Herdr has two CLIs, and each prints its own current manual:

- `herdr-app` changes what the person sees: spaces, tabs, panes, layouts, mods.
- `hc` (herdr-core) runs, reads, waits on and messages terminals and agents.

1. Check `HC_TERMINAL_ID` is set. That is your terminal's address in `hc`. When it is unset, tell the user you are not running inside the Herdr app and stop.
2. Read the manual for the job: `hc --skill` for running or coordinating agents and programs, `herdr-app --skill` for changing the window. Both when the job does both. The installed binaries are the authority; follow them over anything you remember.

Done when you have read every manual the job needs, before the first `hc` or `herdr-app` command that changes anything.

`herdr` (no suffix) is the older Herdr TUI. It is not used here; `HERDR_ENV` stays unset.
