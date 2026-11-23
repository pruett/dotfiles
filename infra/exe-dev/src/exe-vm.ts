import * as Effect from "effect/Effect";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import { exe, onVm, run } from "./run.ts";

export interface ExeVmProps {
  /** VM name on exe.dev; also its tailnet hostname. Starts with `exe-dev-`. */
  name: string;
  cpu: number;
  /** e.g. "8GB". */
  memory: string;
  /** e.g. "50GB". Disk only grows; a smaller value is ignored. */
  disk?: string;
  /** exe.dev integrations to attach at creation, e.g. the Tailscale workload identity. */
  integrations: string[];
  /** Environment variables set on the VM. */
  env: Record<string, string>;
  /** Runs once at first boot (exe.dev `--setup-script`, max 10 KiB). */
  setupScript: string;
}

export interface ExeVmAttributes {
  name: string;
  /** exe.dev's SSH route to the VM, authenticated by this Mac's exe.dev key. */
  host: string;
}

export type ExeVm = Resource<"ExeDev.Vm", ExeVmProps, ExeVmAttributes>;

/** An exe.dev VM, created with `ssh exe.dev new` and deleted with `ssh exe.dev rm`. */
export const ExeVm = Resource<ExeVm>("ExeDev.Vm");

interface ListedVm {
  vm_name: string;
  allocated_cpus: number;
  memory_capacity_bytes: number;
}

const listVms = exe(["ls", "--json"]).pipe(
  Effect.map((out) => (JSON.parse(out) as { vms: ListedVm[] }).vms),
);

const findVm = (name: string) =>
  listVms.pipe(Effect.map((vms) => vms.find((vm) => vm.vm_name === name)));

const bytes = (size: string) => {
  const match = /^(\d+)\s*([GM]?)B?$/i.exec(size.trim());
  if (!match) return undefined;
  const unit = match[2]?.toUpperCase() === "M" ? 2 ** 20 : 2 ** 30;
  return Number(match[1]) * unit;
};

const attributes = (name: string): ExeVmAttributes => ({ name, host: `${name}.exe.xyz` });

export const ExeVmProvider = () =>
  Provider.succeed(ExeVm, {
    // A new name is a new VM, and the setup script only runs at first boot,
    // so changing either rebuilds the VM. Size changes resize it in place.
    diff: ({ olds, news }) =>
      Effect.sync(() => {
        // news may still hold unresolved inputs at plan time; compare only plain strings.
        const next = news as Partial<Record<keyof ExeVmProps, unknown>>;
        if (typeof next.name !== "string" || typeof next.setupScript !== "string") return;
        if (olds.name !== next.name || olds.setupScript !== next.setupScript) {
          return { action: "replace" } as const;
        }
      }),

    reconcile: ({ news, session }) =>
      Effect.gen(function* () {
        const existing = yield* findVm(news.name);

        if (!existing) {
          const args = [
            "new",
            `--name=${news.name}`,
            `--cpu=${news.cpu}`,
            `--memory=${news.memory}`,
            "--no-email",
            "--json",
            "--setup-script=/dev/stdin",
            ...(news.disk ? [`--disk=${news.disk}`] : []),
            ...news.integrations.map((i) => `--integration=${i}`),
            ...Object.entries(news.env).map(([k, v]) => `--env=${k}=${v}`),
          ];
          yield* session.note(`creating ${news.name} on exe.dev`);
          yield* exe(args, news.setupScript);
          // A new VM has a new host key; forget any old one for this name.
          yield* run("ssh-keygen", ["-R", `${news.name}.exe.xyz`]).pipe(Effect.ignore);
          return attributes(news.name);
        }

        const memory = bytes(news.memory);
        if (existing.allocated_cpus !== news.cpu || (memory && existing.memory_capacity_bytes !== memory)) {
          yield* session.note(`resizing ${news.name} to ${news.cpu} CPUs, ${news.memory}`);
          yield* exe(["resize", news.name, `--cpu=${news.cpu}`, `--memory=${news.memory}`]);
        }
        if (news.disk) {
          // exe.dev refuses to shrink a disk, so only ask for growth.
          yield* exe(["resize", news.name, `--disk=${news.disk}`]).pipe(Effect.ignore);
        }
        return attributes(news.name);
      }),

    delete: ({ output }) =>
      Effect.gen(function* () {
        if (!(yield* findVm(output.name))) return;
        // Leave the tailnet first, so the device does not linger there.
        yield* onVm(output.name, "sudo tailscale logout").pipe(Effect.ignore);
        yield* exe(["rm", output.name]);
      }),

    read: ({ output }) =>
      output ? findVm(output.name).pipe(Effect.map((vm) => (vm ? attributes(vm.vm_name) : undefined))) : Effect.succeed(undefined),

    list: () =>
      listVms.pipe(
        Effect.map((vms) => vms.filter((vm) => vm.vm_name.startsWith("exe-dev-")).map((vm) => attributes(vm.vm_name))),
      ),
  });
