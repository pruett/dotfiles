---
name: devin
description: "Run the Devin CLI as the right account (SuppCo or Function Health) with `devin-as`. Use before any `devin` command: starting a session, `devin -p`, `devin auth`, cloud sessions, or adding a Devin login."
---

# Devin

`devin-as` (on `PATH`; its source is [`scripts/devin-as`](scripts/devin-as), run that when `devin-as` is missing) runs `devin` with one account's login. Each account keeps its own credentials and session history; all share `~/.config/devin` (config, skills, rules).

## Pick the account

| Account | Command | Work it covers |
|---|---|---|
| `suppco` | `devin-as suppco …` | SuppCo repos and tasks; plain `devin` uses this login too |
| `functionhealth` | `devin-as functionhealth …` | Function Health repos and tasks |

Everything after the account name goes to `devin` unchanged: `devin-as functionhealth -p -- "summarise this repo"`, `devin-as suppco list`. When the account is unclear from the repo or the request, ask the user which one.

## Check and add logins

- `devin-as` alone prints each account, whether it is logged in, and its data folder.
- `devin-as <new-name> auth login` adds an account; it then appears in the list. The login opens a browser, so hand that command to the user.

## Gotcha: inherited `XDG_DATA_HOME`

`devin-as` works by setting `XDG_DATA_HOME`, and commands Devin runs inherit it. For `functionhealth`, a tool that stores data under `XDG_DATA_HOME` (pnpm's store, for example) writes inside `~/.local/share/devin-functionhealth/`. When such a tool misbehaves inside a Function Health session, run it with `XDG_DATA_HOME="$HOME/.local/share"`.
