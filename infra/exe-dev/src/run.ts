import { spawn } from "node:child_process";
import * as Effect from "effect/Effect";

export interface CommandError {
  readonly _tag: "CommandError";
  readonly message: string;
}

/** Run a local command; fails with its stderr when it exits non-zero. */
export const run = (command: string, args: readonly string[], input?: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(stdout)
            : reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr.trim()}`)),
        );
        child.stdin.end(input ?? "");
      }),
    catch: (e): CommandError => ({ _tag: "CommandError", message: String((e as Error).message ?? e) }),
  });

const sshOptions = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20"];

/** Run an exe.dev CLI command (`ssh exe.dev <args>`), as this Mac's exe.dev account. */
export const exe = (args: readonly string[], input?: string) =>
  run("ssh", [...sshOptions, "exe.dev", ...args], input);

/** Run a shell command on a VM through its exe.dev route (`<name>.exe.xyz`). */
export const onVm = (vm: string, script: string) =>
  run("ssh", [...sshOptions, "-o", "StrictHostKeyChecking=accept-new", `${vm}.exe.xyz`, script]);
