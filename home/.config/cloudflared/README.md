# Cloudflare Tunnel (`cloudflared`)

Exposes local dev servers at a stable `*.supp.co` hostname via a Cloudflare Tunnel
that runs as a macOS LaunchDaemon (root). Everything version-controlled about it
lives here; the secret does not.

| What | Where | Tracked? |
|---|---|---|
| Tunnel id, expected ingress, system paths | `tunnel.conf` | yes |
| LaunchDaemon definition | `com.cloudflare.cloudflared.plist` | yes |
| Connector token | `token.local` (chmod 600) | **no** (gitignored) |
| Ingress rules (source of truth) | Cloudflare dashboard → Zero Trust → Networks → Tunnels | n/a |
| Runtime copies written by `install` | `/Library/LaunchDaemons/…plist`, `/Library/Application Support/com.cloudflare.cloudflared/token` | n/a |
| Logs | `/Library/Logs/com.cloudflare.cloudflared.{out,err}.log` | n/a |

`cloudflared` itself and Cloudflare WARP are in the Brewfile. Note `cloudflared`
does **not** read this directory: it is remotely managed (`tunnel run --token-file`),
so a local `config.yml` would be ignored. `tunnel.conf` is a record for humans and
for the helper script, not runtime config.

## Commands

```bash
cloudflared-tunnel status        # service, edge connections, live ingress, probes each hostname
cloudflared-tunnel install       # (sudo) write plist + token to system paths and start the daemon
cloudflared-tunnel restart       # (sudo) kickstart the daemon
cloudflared-tunnel logs          # tail the daemon log
cloudflared-tunnel export-token  # (sudo) copy the installed system token into token.local
cloudflared-tunnel uninstall     # (sudo) stop and remove the daemon + token
```

## New machine

1. `brew bundle` (installs `cloudflared`).
2. Get the connector token: dashboard → the tunnel → **Configure** → copy the token
   from the install command, or on an already-set-up machine run
   `cloudflared-tunnel export-token`.
3. Save it: `printf '%s' '<token>' > ~/.config/cloudflared/token.local && chmod 600 ~/.config/cloudflared/token.local`
   (or export `CLOUDFLARE_TUNNEL_TOKEN` for a one-off install).
4. `cloudflared-tunnel install`, then `cloudflared-tunnel status`.

A connector token is per-tunnel, so a second machine running `install` with the
same token joins the same tunnel as an extra connector, and traffic is balanced
between them. Create a separate tunnel per machine if that is not what you want.

## Changing routes

Edit the Public Hostname tab in the dashboard, then mirror the change in
`INGRESS` in `tunnel.conf` so `status` keeps probing the right hosts. `status`
warns when the live ingress and `tunnel.conf` disagree.

HTTPS origins (mkcert) work because the daemon runs as root and Go trusts the
System keychain, where `mkcert -install` puts its CA. If an origin ever fails TLS,
set **No TLS Verify** on that hostname in the dashboard rather than downgrading
the origin to http.
