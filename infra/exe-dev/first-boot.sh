#!/usr/bin/env bash
# First boot of an exe.dev VM declared in infra/exe-dev. exe.dev runs this once
# (--setup-script, max 10 KiB). The deploy sets VM_NAME, GIT_NAME and GIT_EMAIL
# (--env) and waits for ~/first-boot.status to read done.
#
# 1. Clone the dotfiles and link the agent skills (skills-sync, plus a timer).
# 2. Git identity, and an SSH key for GitHub (the deploy registers it).
# 3. Join the tailnet with Tailscale SSH on, using exe.dev's workload identity.
set -euo pipefail

USER_NAME=exedev
if [[ "$(id -un)" != "$USER_NAME" ]]; then
  # exe.dev may run this as root; do the work as the login user.
  exec sudo -u "$USER_NAME" -H --preserve-env=VM_NAME,GIT_NAME,GIT_EMAIL bash "$0" "$@"
fi

cd "$HOME"
STATUS="$HOME/first-boot.status"
exec >>"$HOME/first-boot.log" 2>&1
echo running >"$STATUS"
trap 'echo failed >"$STATUS"' ERR
echo "== first boot of ${VM_NAME:?} at $(date -u +%FT%TZ)"

DOTFILES="$HOME/.dotfiles"
REPO_HTTPS="https://github.com/pruett/dotfiles.git"
REPO_SSH="git@github.com:pruett/dotfiles.git"
WIF_URL="https://tailscale-wif.int.exe.xyz"

# --- 1. dotfiles and skills -----------------------------------------------------
# The whole repo lands here so skills that read other files find them; only the
# skills are linked into ~. Fetch over HTTPS (public repo), push over SSH.
[[ -d "$DOTFILES/.git" ]] || git clone --quiet "$REPO_HTTPS" "$DOTFILES"
git -C "$DOTFILES" remote set-url --push origin "$REPO_SSH"
"$DOTFILES/home/.local/bin/skills-sync"

# A system unit that runs as exedev: a user unit needs a session bus that a
# plain ssh command lacks.
sudo tee /etc/systemd/system/skills-sync.service >/dev/null <<EOF
[Unit]
Description=Sync agent skills with the dotfiles repo
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$USER_NAME
ExecStart=$HOME/.local/bin/skills-sync
EOF
sudo tee /etc/systemd/system/skills-sync.timer >/dev/null <<'EOF'
[Unit]
Description=Run skills-sync every 10 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now skills-sync.timer

# --- 2. git and the GitHub key --------------------------------------------------
git config --global user.name "${GIT_NAME:?}"
git config --global user.email "${GIT_EMAIL:?}"

KEY="$HOME/.ssh/id_ed25519_github"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N "" -C "${VM_NAME}" -f "$KEY"
if ! grep -q "id_ed25519_github" "$HOME/.ssh/config" 2>/dev/null; then
  cat >>"$HOME/.ssh/config" <<EOF
Host github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
fi
ssh-keyscan -t ed25519 github.com 2>/dev/null >>"$HOME/.ssh/known_hosts"
# The same key signs commits once the deploy registers it for signing.
git config --global gpg.format ssh
git config --global user.signingkey "$KEY.pub"
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# --- 3. tailnet -------------------------------------------------------------------
# No auth key: exe.dev's tailscale-wif integration hands out a short-lived token.
sudo systemctl enable --now tailscaled
if ! tailscale status --json 2>/dev/null | grep -q '"BackendState": *"Running"'; then
  META="$(curl -fsS "$WIF_URL/metadata")"
  CLIENT_ID="$(jq -er .client_id <<<"$META")"
  TAGS="$(jq -r '.tags // "tag:exe-dev"' <<<"$META")"
  ID_TOKEN="$(curl -fsS "$WIF_URL/token" | jq -er .token)"
  sudo tailscale up --ssh --hostname="$VM_NAME" --advertise-tags="$TAGS" \
    --client-id="${CLIENT_ID}?preauthorized=true" --id-token="$ID_TOKEN"
fi

echo "== done at $(date -u +%FT%TZ)"
echo done >"$STATUS"
