# exe.dev VMs

Your exe.dev dev boxes, declared in [`src/workstations.ts`](src/workstations.ts) and deployed with [Alchemy](https://alchemy.run) (v2, beta). The pattern follows dmmulroy's dotfiles: the VM list lives in code, first boot installs everything, and you reach each box over Tailscale with `ssh exe-dev-<name>`.

```
bun run deploy
  └─ per workstation
     ├─ ExeDev.Vm           ssh exe.dev new --setup-script first-boot.sh --integration tailscale-wif
     ├─ ExeDev.FirstBoot    wait for ~/first-boot.status = done, read the VM's GitHub key
     ├─ GitHub.UserSshKey   add that key to your GitHub account (authentication + signing)
     └─ Herdr.Machine       hc machine add <name>.exe.xyz --install
```

[`first-boot.sh`](first-boot.sh) runs once on the VM. It clones these dotfiles, links the agent skills and adds a `skills-sync` timer. It sets the git identity, makes `~/.ssh/id_ed25519_github` for pushing and commit signing, and joins the tailnet with Tailscale SSH on. Its log is `~/first-boot.log` on the VM.

## Use

```bash
cd ~/.dotfiles/infra/exe-dev
bun install
bun run plan      # what a deploy would change
bun run deploy
ssh exe-dev-main  # over the tailnet
```

Then log in to the model tools on the VM once: run `claude`, then `codex login --device-auth`. Those logins stay on the VM's disk.

- **Add a VM:** add an entry to `src/workstations.ts` and deploy. Names start with `exe-dev-`.
- **Resize:** change `cpu`, `memory` or `disk` and deploy. Disk only grows.
- **Rebuild:** a change to `first-boot.sh` replaces every VM on the next deploy.
- **Delete:** set `whenRemoved: "delete"` on the entry and deploy, then remove the entry and deploy again. That deletes the VM, takes it off the tailnet, removes its GitHub keys and its herdr-core machine. Removing an entry without that first step keeps everything and only drops it from Alchemy's state.

Alchemy keeps its state in `.alchemy/` here (gitignored), so deploy from this Mac.

## One-time setup

1. **GitHub scopes.** The deploy adds keys through your `gh` login, which needs two more scopes:
   `gh auth refresh -s admin:public_key,admin:ssh_signing_key`
2. **Tailscale policy.** In the tailnet policy file, make yourself the owner of `tag:exe-dev`, and allow Tailscale SSH from your devices to `tag:exe-dev` as `exedev`.
3. **Tailscale trust credential.** In the Tailscale admin console, add an OpenID Connect trust credential with exe.dev as the issuer, the Auth Keys scope and `tag:exe-dev`. The issuer and subject values are on [exe.dev's Tailscale page](https://exe.dev/docs/integrations-tailscale-wif). Copy its client ID.
4. **exe.dev integration.** Create the `tailscale-wif` integration the VMs use:

   ```bash
   ssh exe.dev integrations add wif --name tailscale-wif --consumer tailscale \
     --audience api.tailscale.com/CLIENT_ID \
     --metadata=client_id=CLIENT_ID --metadata=tags=tag:exe-dev
   ```

5. **This Mac** runs the Tailscale app and is on the same tailnet. `dot link` adds `~/.ssh/config.d/exe-dev` and `tailnet-ssh-known-hosts`; `~/.ssh/config` must start with `Include config.d/*`.
