import * as Effect from "effect/Effect";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import { run } from "./run.ts";

export interface GitHubKeyProps {
  title: string;
  /** An OpenSSH public key line. */
  publicKey: string;
  /** `authentication` for git over SSH, `signing` for signed commits. */
  kind: "authentication" | "signing";
}

export interface GitHubKeyAttributes {
  id: number;
  kind: GitHubKeyProps["kind"];
  publicKey: string;
}

export type GitHubKey = Resource<"GitHub.UserSshKey", GitHubKeyProps, GitHubKeyAttributes>;

/**
 * An SSH key on your GitHub account, added through this Mac's `gh` login.
 * Needs the admin:public_key and admin:ssh_signing_key scopes:
 * `gh auth refresh -s admin:public_key,admin:ssh_signing_key`.
 */
export const GitHubKey = Resource<GitHubKey>("GitHub.UserSshKey");

const path = (kind: GitHubKeyProps["kind"]) => (kind === "signing" ? "/user/ssh_signing_keys" : "/user/keys");

// GitHub stores the key without its comment, so compare type and body only.
const body = (key: string) => key.trim().split(/\s+/).slice(0, 2).join(" ");

const findKey = (kind: GitHubKeyProps["kind"], publicKey: string) =>
  run("gh", ["api", "--paginate", path(kind)]).pipe(
    Effect.map((out) =>
      (JSON.parse(out.replace(/\]\s*\[/g, ",")) as { id: number; key: string }[]).find(
        (k) => body(k.key) === body(publicKey),
      ),
    ),
  );

const deleteKey = (kind: GitHubKeyProps["kind"], id: number) =>
  run("gh", ["api", "-X", "DELETE", `${path(kind)}/${id}`]).pipe(
    // Already gone is fine.
    Effect.catch((e) => (/404|Not Found/.test(e.message) ? Effect.void : Effect.fail(e))),
  );

export const GitHubKeyProvider = () =>
  Provider.succeed(GitHubKey, {
    reconcile: ({ news, output }) =>
      Effect.gen(function* () {
        if (output && (output.kind !== news.kind || body(output.publicKey) !== body(news.publicKey))) {
          yield* deleteKey(output.kind, output.id);
        }
        const existing = yield* findKey(news.kind, news.publicKey);
        if (existing) return { id: existing.id, kind: news.kind, publicKey: news.publicKey };
        const created = yield* run("gh", [
          "api", "-X", "POST", path(news.kind), "-f", `title=${news.title}`, "-f", `key=${news.publicKey}`,
        ]);
        return { id: (JSON.parse(created) as { id: number }).id, kind: news.kind, publicKey: news.publicKey };
      }),
    delete: ({ output }) => deleteKey(output.kind, output.id),
    list: () => Effect.succeed([]),
  });
