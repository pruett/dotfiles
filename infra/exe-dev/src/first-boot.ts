import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import { onVm } from "./run.ts";

export interface FirstBootProps {
  /** The VM's exe.dev name. */
  vm: string;
}

export interface FirstBootAttributes {
  /** `~/.ssh/id_ed25519_github.pub`, made by first-boot.sh. */
  githubPublicKey: string;
}

export type FirstBoot = Resource<"ExeDev.FirstBoot", FirstBootProps, FirstBootAttributes>;

/** Waits for a VM's first-boot.sh to finish, then reads the GitHub key it made. */
export const FirstBoot = Resource<FirstBoot>("ExeDev.FirstBoot");

interface FirstBootFailed {
  readonly _tag: "FirstBootFailed";
  readonly message: string;
}
interface FirstBootPending {
  readonly _tag: "FirstBootPending";
  readonly message: string;
}

// first-boot.sh writes running, done or failed to ~/first-boot.status.
const status = (vm: string) =>
  onVm(vm, "cat ~/first-boot.status 2>/dev/null || echo pending").pipe(
    Effect.map((out) => out.trim()),
    Effect.orElseSucceed(() => "unreachable"),
  );

const waitForDone = (vm: string) =>
  status(vm).pipe(
    Effect.flatMap((s): Effect.Effect<void, FirstBootFailed | FirstBootPending> =>
      s === "done"
        ? Effect.void
        : s === "failed"
          ? onVm(vm, "tail -n 30 ~/first-boot.log").pipe(
              Effect.orElseSucceed(() => ""),
              Effect.flatMap((log) =>
                Effect.fail<FirstBootFailed>({
                  _tag: "FirstBootFailed",
                  message: `first boot failed on ${vm}; end of ~/first-boot.log:\n${log}`,
                }),
              ),
            )
          : Effect.fail<FirstBootPending>({ _tag: "FirstBootPending", message: `first boot on ${vm}: ${s}` }),
    ),
    // Up to 20 minutes, checking every 15 seconds; a failure stops at once.
    Effect.retry({
      schedule: Schedule.spaced("15 seconds"),
      times: 80,
      while: (e) => e._tag === "FirstBootPending",
    }),
  );

export const FirstBootProvider = () =>
  Provider.succeed(FirstBoot, {
    reconcile: ({ news, session }) =>
      Effect.gen(function* () {
        yield* session.note(`waiting for first boot on ${news.vm} (~/first-boot.log)`);
        yield* waitForDone(news.vm);
        const key = yield* onVm(news.vm, "cat ~/.ssh/id_ed25519_github.pub");
        return { githubPublicKey: key.trim() };
      }),
    delete: () => Effect.void,
    list: () => Effect.succeed([]),
  });
