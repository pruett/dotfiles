#!/usr/bin/env node
// Approved core-only launcher. The reviewed CLI release is fixed at 0.9.86.
import "./lib/windows-exe-search.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./lib/main-module.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const manifests = [
  "plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
];

// The oldest release this launcher starts, for a plugin pin or any standalone selection. It stays at
// or above the oldest release the HyperFrames Desktop app accepts, which has every protection for
// projects received from someone else, so a pin copied from a project never runs a CLI without them.
// Desktop's release checks read this line from the published package, so it stays a string literal.
const CLI_FLOOR = "0.9.68";
export const STANDALONE_CLI = "hyperframes@0.9.86";

const realOrResolved = (path) => {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
};

const isOutside = (from, to) => {
  const path = relative(from, to);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
};

// Plugin managers keep bundles in their own folders, such as ~/.claude/plugins or ~/.gemini/extensions.
// Skills in a dot folder (.agents, .claude) or in the working folder's own tree are project content.
function isPluginBundle(pluginRoot, workDir) {
  const bundle = realOrResolved(pluginRoot);
  const work = realOrResolved(workDir);
  if (basename(bundle).startsWith(".") || !isOutside(bundle, work)) return false;
  if (isOutside(work, bundle)) return true;
  return relative(work, bundle)
    .split(sep)
    .some((segment) => segment.startsWith("."));
}

function isBelowFloor(version) {
  const parts = (text) => text.split(/[-+]/, 1)[0].split(".").map(Number);
  const [have, floor] = [parts(version), parts(CLI_FLOOR)];
  const at = have.findIndex((part, index) => part !== floor[index]);
  return at === -1 ? version.split("+", 1)[0].includes("-") : have[at] < floor[at];
}

function isExactRelease(value) {
  const match =
    typeof value === "string" &&
    value.length <= 256 &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    );
  return Boolean(
    match &&
    !match[4]?.split(".").some((id) => /^0\d+$/.test(id)) &&
    match.slice(1, 4).every((part) => Number.isSafeInteger(Number(part))),
  );
}

function standaloneRelease(value) {
  if (value !== "0.9.86") throw new Error("This installation requires HyperFrames 0.9.86.");
  return value;
}

export function pluginVersion(pluginRoot = root, workDir = process.cwd()) {
  if (!isPluginBundle(pluginRoot, workDir)) return undefined;
  for (const path of manifests) {
    const file = join(pluginRoot, path);
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (manifest.name !== "hyperframes" || !isExactRelease(manifest.version)) {
      throw new Error(`Invalid HyperFrames plugin release: ${file}`);
    }
    if (isBelowFloor(manifest.version))
      throw new Error(
        `${file} pins HyperFrames ${manifest.version}; this launcher runs ${CLI_FLOOR} or newer.`,
      );
    return manifest.version;
  }
  return undefined;
}

// npm takes the package, bin links and .npmrc from the folder it starts in, so npx starts
// in the home folder and the CLI moves into the project before it runs a command. A shared
// folder such as the temp folder is no substitute, so there is no fallback.
export function npmFolder(home = homedir(), pathExists = existsSync) {
  if (home && pathExists(home)) return home;
  throw new Error("Cannot find your home folder. Set HOME (USERPROFILE on Windows) and retry.");
}

export function invocation(
  args,
  {
    cwd = process.cwd(),
    version = pluginVersion(root, cwd),
    env = process.env,
    platform = process.platform,
    node = process.execPath,
    pathExists = existsSync,
    npmCwd,
    launcher = fileURLToPath(import.meta.url),
  } = {},
) {
  if (version && version !== "0.9.86") throw new Error("This installation requires HyperFrames 0.9.86.");
  let release = version;
  if (args[0] === "--cli-version") {
    if (version) throw new Error("The plugin manager selects this plugin's CLI version.");
    release = standaloneRelease(args[1]);
    args = args.slice(2);
  } else if (!version && env.HYPERFRAMES_STANDALONE_CLI_VERSION !== undefined) {
    release = standaloneRelease(env.HYPERFRAMES_STANDALONE_CLI_VERSION);
  }
  const allowed = new Set(["init", "lint", "check", "snapshot", "keyframes", "timeline", "history", "preview", "render", "audio", "info", "compositions", "docs", "beats", "normalize-audio", "--help", "--version"]);
  if (!allowed.has(args[0])) throw new Error("Command outside the approved local workflow.");
  if (args.some((arg) => /^(?:--example|--video|--docker|--batch|--webhook)(?:=|$)/.test(arg)))
    throw new Error("This option requires a separate workflow review.");
  if (args[0] === "init" && !args.includes("--skip-skills")) args = [...args, "--skip-skills"];
  const childEnv = version
    ? {
        ...env,
        HYPERFRAMES_SKIP_SKILLS: "1",
        HYPERFRAMES_SKILL_PKG_VERSION: version,
        HYPERFRAMES_PLUGIN_VERSION: version,
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
      }
    : { ...env };
  Object.assign(childEnv, {
    HYPERFRAMES_STANDALONE_CLI_VERSION: "0.9.86",
    HYPERFRAMES_NO_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1",
  });
  const cliArgs = ["--yes", release ? `hyperframes@${release}` : STANDALONE_CLI, ...args];
  const cliEnv = { ...childEnv, HYPERFRAMES_PLUGIN_CWD: cwd };
  const npxCwd = npmCwd ?? npmFolder();
  if (platform !== "win32") return { command: "npx", args: cliArgs, env: cliEnv, cwd: npxCwd };
  const candidates = [
    env.npm_execpath && win32.join(win32.dirname(env.npm_execpath), "npx-cli.js"),
    win32.join(win32.dirname(node), "node_modules", "npm", "bin", "npx-cli.js"),
  ].filter(Boolean);
  const npx = candidates.find(pathExists);
  if (!npx)
    throw new Error(
      "Cannot find npx-cli.js. Install Node.js with npm or run from an npm environment.",
    );
  return { command: node, args: [npx, ...cliArgs], env: cliEnv, cwd: npxCwd };
}

if (isMainModule(import.meta.url)) {
  try {
    const command = invocation(process.argv.slice(2));
    const result = spawnSync(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
