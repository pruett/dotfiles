import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ExeVm, ExeVmProvider } from "./src/exe-vm.ts";
import { FirstBoot, FirstBootProvider } from "./src/first-boot.ts";
import { GitHubKey, GitHubKeyProvider } from "./src/github-key.ts";
import { HerdrMachine, HerdrMachineProvider } from "./src/herdr-machine.ts";
import { workstations } from "./src/workstations.ts";

// exe.dev integration that gives each VM a Tailscale token (see README).
const TAILSCALE_WIF = "tailscale-wif";

const setupScript = readFileSync(new URL("./first-boot.sh", import.meta.url), "utf8");
const gitConfig = (key: string) =>
  execFileSync("git", ["config", "--global", "--includes", key], { encoding: "utf8" }).trim();

const workstation = (w: (typeof workstations)[number]) =>
  Effect.gen(function* () {
    const removal = w.whenRemoved === "delete" ? Alchemy.RemovalPolicy.destroy() : Alchemy.RemovalPolicy.retain();

    const vm = yield* ExeVm(w.name, {
      name: w.name,
      cpu: w.cpu,
      memory: w.memory,
      disk: w.disk,
      integrations: [TAILSCALE_WIF],
      env: { VM_NAME: w.name, GIT_NAME: gitConfig("user.name"), GIT_EMAIL: gitConfig("user.email") },
      setupScript,
    }).pipe(removal);

    const boot = yield* FirstBoot(`${w.name}-first-boot`, { vm: vm.name });

    for (const kind of ["authentication", "signing"] as const) {
      yield* GitHubKey(`${w.name}-github-${kind}`, {
        title: w.name,
        publicKey: boot.githubPublicKey,
        kind,
      }).pipe(removal);
    }

    yield* HerdrMachine(`${w.name}-herdr`, { name: w.name, host: vm.host }).pipe(removal);

    return { name: w.name, ssh: `ssh ${w.name}` };
  });

export default Alchemy.Stack(
  "ExeDev",
  {
    providers: Layer.mergeAll(ExeVmProvider(), FirstBootProvider(), GitHubKeyProvider(), HerdrMachineProvider()),
    state: Alchemy.localState(),
  },
  Effect.forEach(workstations, workstation),
);
