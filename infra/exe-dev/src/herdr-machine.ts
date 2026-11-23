import * as Effect from "effect/Effect";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import { run } from "./run.ts";

export interface HerdrMachineProps {
  /** Name herdr-core uses, as in `hc run --on <name>`. */
  name: string;
  /** SSH destination, e.g. `exe-dev-main.exe.xyz`. */
  host: string;
}

export interface HerdrMachineAttributes {
  name: string;
}

export type HerdrMachine = Resource<"Herdr.Machine", HerdrMachineProps, HerdrMachineAttributes>;

/** A herdr-core machine on this Mac (`hc machine add --install`), so `hc run --on <name>` reaches the VM. */
export const HerdrMachine = Resource<HerdrMachine>("Herdr.Machine");

const known = (name: string) =>
  run("hc", ["machine", "ls", "--json"]).pipe(
    Effect.map((out) => out.includes(`"${name}"`)),
    Effect.orElseSucceed(() => false),
  );

const hasHc = run("sh", ["-c", "command -v hc"]).pipe(
  Effect.as(true),
  Effect.orElseSucceed(() => false),
);

export const HerdrMachineProvider = () =>
  Provider.succeed(HerdrMachine, {
    reconcile: ({ news, session }) =>
      Effect.gen(function* () {
        if (!(yield* hasHc)) {
          yield* session.note("hc is not installed on this Mac; skipping herdr-core");
          return { name: news.name };
        }
        if (!(yield* known(news.name))) {
          yield* run("hc", ["machine", "add", news.host, "--name", news.name, "--install"]);
        }
        return { name: news.name };
      }),
    delete: ({ output }) =>
      Effect.gen(function* () {
        if ((yield* hasHc) && (yield* known(output.name))) {
          yield* run("hc", ["machine", "rm", output.name]);
        }
      }),
    list: () => Effect.succeed([]),
  });
