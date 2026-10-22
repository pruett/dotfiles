#!/bin/sh
# installed by wt
# managed by wt; reinstalling or updating the integration overwrites this file.
# add custom hooks beside this file instead of editing it.
# WT_INTEGRATION_ID=claude
# WT_INTEGRATION_VERSION=1

# Routes the harness's WorktreeCreate/WorktreeRemove events through wt, so its
# worktrees land beside the repos wt's config allows and other repos keep
# the harness's default layout.
wt="${WT_BIN:-$HOME/.local/bin/wt}"
if [ ! -x "$wt" ]; then
  echo "wt-worktree.sh: $wt is missing; reinstall it or run: wt integration uninstall claude" >&2
  exit 1
fi
exec "$wt" hook claude "${1:-}"
