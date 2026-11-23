/**
 * The exe.dev VMs to keep running. Add one and run `bun run deploy`.
 *
 * Names start with `exe-dev-`: that is the tailnet hostname, and the Mac's
 * `Host exe-dev-*` ssh block matches it.
 *
 * Removing an entry keeps the VM by default (it only drops out of Alchemy's
 * state). To delete a VM: set `whenRemoved: "delete"`, deploy, then remove the
 * entry and deploy again. That deletes the VM, takes it off the tailnet, and
 * removes its GitHub keys.
 */
export interface Workstation {
  name: `exe-dev-${string}`;
  cpu: number;
  memory: string;
  disk?: string;
  whenRemoved?: "keep" | "delete";
}

export const workstations: Workstation[] = [
  { name: "exe-dev-main", cpu: 4, memory: "8GB" },
];
