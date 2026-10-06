# Devin plugin

Personal [Devin plugin](https://docs.devin.ai/cli/extensibility/plugins/overview). It lives under a dot-directory so `bootstrap` doesn't stow it into `~`.

```
.devin-plugin/plugin.json   manifest (only `name` is required)
skills/<name>/SKILL.md      skills
```

## Sharing a skill with `~/.agents/skills`

Keep the real files here and symlink back, so the plugin is self-contained when Devin clones this subfolder:

```bash
git mv home/.agents/skills/<name> .plugins/devin/skills/<name>
ln -s ../../../.plugins/devin/skills/<name> home/.agents/skills/<name>
```

## Install

CLI (Personal scope by default):

```bash
devin plugins install pruett/dotfiles#.plugins/devin
devin plugins update dotfiles   # re-fetch latest HEAD
```

Web app: **Customize → Plugins → Personal → Add plugin → From repository**, then enter `https://github.com/pruett/dotfiles` with subpath `.plugins/devin`.

New cloud sessions pick up pushes to the default branch. Use **Reindex plugins** in plugin settings to refresh the Customize listing.

## Automations

Devin Automations (schedule, Slack, GitHub, Linear and webhook triggers) are set up in the web app, not shipped in a plugin. See https://docs.devin.ai/product-guides/automations.

### api-contract-batch loop

Each run does one batch and opens one PR. Two triggers on one automation keep it going:

| Trigger | Config |
|---|---|
| GitHub → Pull request, closed | repo `SuppleCo/backend`, condition: head branch starts with `api-contract/` |
| Schedule | weekdays 9:00, RRULE `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0` |

Action: **Start session**, prompt:

```
Run /api-contract-batch. First, if SuppleCo/backend has an open PR whose head branch starts with api-contract/, report "waiting on <url>" and stop.
```

Limits: concurrent runs 1 (queue on), ACU limit per session, email on failure.
