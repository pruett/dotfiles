# Devin plugin

Personal [Devin plugin](https://docs.devin.ai/cli/extensibility/plugins/overview). It lives under a dot-directory so `bootstrap` doesn't stow it into `~`.

```
.devin-plugin/plugin.json   manifest (only `name` is required)
AGENTS.md                   always-on rule
skills/<name>/SKILL.md      skills
hooks.json                  lifecycle hooks (CLI and Desktop only; fail open)
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

Devin Automations (schedule, Slack, GitHub, Linear and webhook triggers) are set up in the web app, not shipped in a plugin. `hooks.json` covers in-session automation. See https://docs.devin.ai/product-guides/automations.
