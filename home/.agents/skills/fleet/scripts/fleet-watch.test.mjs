// Tests for the Captain's watcher (`fleet inbox --wait`), for `fleet run` waiting on a new
// worker, for `fleet send` refusing a Claude dialog and for the program `fleet exec` starts,
// against a mocked `hc`: node --test <this file>.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SCRIPT = process.env.FLEET_SCRIPT || path.join(path.dirname(new URL(import.meta.url).pathname), "fleet"); // FLEET_SCRIPT: test another version
const SOURCE = fs.readFileSync(SCRIPT, "utf8").replace(/main\(\);\s*$/, "globalThis.api = { main };");
const P = "sup-5182", LEAD = `lead-${P}`, WORKER = `${P}-researcher-findings`;
class Exit extends Error {}
class Slept extends Error {} // `inbox --wait` found nothing and went to sleep: one poll is over

// A fleet with an active project sup-5182 and a mocked hc whose terminals are `terms`
// ({name: {status, screen}}); `sent` collects every `hc send`. `started` gives what `hc run` starts.
function setup({ started = () => ({ screen: "" }), project = P } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-watch-")));
  const bin = path.join(root, "bin"); // every role's program, so `fleet exec` finds it on PATH
  fs.mkdirSync(bin);
  for (const prog of ["claude", "codex", "devin-as"]) fs.writeFileSync(path.join(bin, prog), "", { mode: 0o755 });
  const home = path.join(root, ".fleet"), pdir = path.join(home, "projects", project);
  fs.mkdirSync(path.join(pdir, "briefs"), { recursive: true });
  fs.writeFileSync(path.join(pdir, "prd.md"), "## PRD\napproved\n");
  const hash = crypto.createHash("sha256").update("approved").digest("hex").slice(0, 16);
  fs.writeFileSync(path.join(pdir, "project.json"), JSON.stringify({ name: project, lead: `lead-${project}`, status: "active", prd_hash: hash }));
  const terms = {}, sent = [], hcDown = new Set(), execs = []; // hcDown: hc commands that fail; execs: programs started
  const hc = (args) => {
    const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
    const missing = { status: 1, stdout: "", stderr: "not_found" };
    const [cmd, name] = args, t = terms[name];
    if (hcDown.has(cmd)) return { status: 1, stdout: "", stderr: "server not running" };
    if (cmd === "ls") return ok(JSON.stringify({ terminals: Object.entries(terms).map(([n, x]) => ({ name: n, state: "live", status: x.status })) }));
    if (cmd === "get") return t ? ok(JSON.stringify({ name, state: "live", status: t.status && { app: "claude-code", state: t.status } })) : missing;
    if (cmd === "run") return (terms[args[args.indexOf("--name") + 1]] = started()), ok("{}");
    if (cmd === "read") return t ? ok(t.screen) : missing;
    if (cmd === "keys") return t?.onKeys?.(args.slice(2)), t ? ok() : missing;
    if (cmd === "send") return t ? (sent.push({ to: name, text: args[2] }), ok()) : missing;
    return ok();
  };
  const spawnSync = (prog, args) => (prog === "hc" ? hc(args) : { status: 0, stdout: "", stderr: "" });
  const fleet = (role, ...argv) => fleetIn(root, role, ...argv);
  const fleetIn = (cwd, role, ...argv) => {
    const outs = [], errs = [];
    let code = 0;
    const proc = { ...process, argv: ["node", SCRIPT, ...argv],
      cwd: () => cwd, execve: (file, args) => { execs.push(args); throw new Exit(); },
      env: { PATH: `${bin}:${process.env.PATH}`, FLEET_HOME: home, FLEET_ROLE: role, ...(role === "lead" ? { FLEET_PROJECT_DIR: pdir } : {}) },
      stdout: { write: (s) => outs.push(s) }, stderr: { write: (s) => errs.push(s) },
      exit: (c) => { code = c; throw new Exit(); } };
    const setTimeout = () => { throw new Slept(); };
    const ctx = vm.createContext({ require: (m) => (m === "node:child_process" ? { spawnSync } : require(m)),
      __filename: SCRIPT, process: proc, setTimeout, console });
    ctx.globalThis = ctx;
    vm.runInContext(SOURCE, ctx);
    return ctx.api.main().catch((e) => { if (!(e instanceof Exit || e instanceof Slept)) throw e; })
      .then(() => ({ code, out: outs.join(""), err: errs.join("") }));
  };
  const inbox = () => fs.readdirSync(path.join(home, "inbox")).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(home, "inbox", f), "utf8")));
  // One look by the Captain's watcher, with the terminals in these states.
  const poll = async (states) => {
    for (const [n, st] of Object.entries(states)) terms[n] = { status: st };
    const r = await fleet("captain", "inbox", "--wait");
    assert.equal(r.code, 0, r.err);
  };
  return { fleet, fleetIn, poll, inbox, terms, sent, execs, root, hcDown };
}

test("a worker turning blocked reaches the Captain's inbox and its lead once per transition", async () => {
  const t = setup();
  await t.poll({ [LEAD]: "idle", [WORKER]: "working" });
  assert.equal(t.inbox().length, 0);
  assert.equal(t.sent.length, 0);

  await t.poll({ [WORKER]: "blocked" });
  const [msg] = t.inbox();
  assert.equal(t.inbox().length, 1);
  assert.equal(msg.kind, "blocked");
  assert.equal(msg.project, P);
  assert.equal(msg.from, WORKER);
  assert.match(msg.text, new RegExp(`hc read ${WORKER}`));
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].to, LEAD);
  assert.match(t.sent[0].text, new RegExp(`${WORKER} is blocked.*hc read ${WORKER} --lines 40`));

  await t.poll({ [WORKER]: "blocked" });
  await t.poll({ [WORKER]: "blocked" });
  assert.equal(t.inbox().length, 1);
  assert.equal(t.sent.length, 1);

  await t.poll({ [WORKER]: "working" });
  await t.poll({ [WORKER]: "blocked" });
  assert.equal(t.inbox().length, 2);
  assert.equal(t.sent.length, 2);
});

test("a worker already blocked when first seen is reported; one restarted under the same name is reported again", async () => {
  const t = setup();
  await t.poll({ [LEAD]: "idle", [WORKER]: "blocked" });
  assert.equal(t.inbox().length, 1);
  delete t.terms[WORKER]; // stopped by its lead
  await t.poll({});
  await t.poll({ [WORKER]: "blocked" });
  assert.equal(t.inbox().length, 2);
  assert.equal(t.sent.length, 2);
});

test("a worker of a project named 'lead' that is restarted already blocked is reported again", async () => {
  const t = setup({ project: "lead" });
  const w = "lead-researcher-findings";
  await t.poll({ "lead-lead": "idle", [w]: "blocked" });
  delete t.terms[w];
  await t.poll({});
  await t.poll({ [w]: "blocked" });
  assert.equal(t.inbox().length, 2);
  assert.equal(t.sent.length, 2);
});

test("a failed hc ls does not make a still-blocked worker look new", async () => {
  const t = setup();
  await t.poll({ [LEAD]: "idle", [WORKER]: "blocked" });
  t.hcDown.add("ls");
  await t.poll({});
  t.hcDown.delete("ls");
  await t.poll({ [WORKER]: "blocked" });
  assert.equal(t.inbox().length, 1);
  assert.equal(t.sent.length, 1);
});

test("a blocked worker whose lead is not running still reaches the Captain", async () => {
  const t = setup();
  await t.poll({ [WORKER]: "blocked" });
  const [msg] = t.inbox();
  assert.equal(msg.from, WORKER);
  assert.match(msg.text, /telling lead-sup-5182 failed/);
  assert.equal(t.sent.length, 0);
});

test("leads are watched as before: blocked and stopped once each, nothing on the first look", async () => {
  const t = setup();
  await t.poll({ [LEAD]: "blocked" });
  assert.equal(t.inbox().length, 0);
  await t.poll({ [LEAD]: "working" });
  await t.poll({ [LEAD]: "blocked" });
  await t.poll({ [LEAD]: "blocked" });
  assert.deepEqual(t.inbox().map((m) => [m.kind, m.from]), [["blocked", LEAD]]);
  delete t.terms[LEAD];
  await t.poll({});
  assert.deepEqual(t.inbox().map((m) => `${m.kind} ${m.from}`).sort(), [`blocked ${LEAD}`, `stopped ${LEAD}`]); // ids in one second sort randomly
  assert.equal(t.sent.length, 0);
});

test("fleet run fails, naming the worker and `hc read`, when the worker never reports a status", async () => {
  const t = setup();
  const r = await t.fleet("lead", "run", "researcher", "findings", "--cwd", t.root, "Read the repo.");
  assert.equal(r.code, 1);
  assert.match(r.err, new RegExp(`${WORKER}.*hc read ${WORKER}`));
  assert.equal(r.out, "");
});

test("fleet run accepts Claude's trust prompt and succeeds once the worker reports a status", async () => {
  const trusting = {
    screen: "Do you trust this folder?\n❯ No, exit\n  Yes, I trust this folder",
    onKeys: (keys) => { if (keys.join(" ") === "down enter") trusting.status = "working"; },
  };
  const t = setup({ started: () => trusting });
  const r = await t.fleet("lead", "run", "researcher", "findings", "--cwd", t.root, "Read the repo.");
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.trim(), WORKER);
});

const TEACH = "  Teach auto mode about your environment?\n\n  ❯ 1. Yes\n    2. Not now\n    3. Don't show again\n\n  Enter to confirm · Esc to cancel\n\n❯ \n";
const TRUST = " Quick safety check: Is this a project you created or one you trust?\n\n ❯ No, exit\n   Yes, I trust this folder\n\n Enter to confirm · Esc to cancel\n";

for (const [dialog, screen] of [["Teach auto mode about your environment?", TEACH], ["trust this folder", TRUST]]) {
  test(`fleet send types nothing and fails, naming the dialog and \`hc read\`, when the target shows "${dialog}"`, async () => {
    const t = setup();
    t.terms[LEAD] = { status: null, screen };
    const r = await t.fleet("captain", "send", LEAD, "Status?");
    assert.equal(r.code, 1);
    assert.ok(r.err.includes(dialog), r.err);
    assert.match(r.err, new RegExp(`hc read ${LEAD}`));
    assert.equal(t.sent.length, 0);
  });
}

test("fleet send still reaches an idle or working target, even one whose earlier output quotes a dialog", async () => {
  const t = setup();
  t.terms[LEAD] = { status: "idle", screen: "❯ \n" };
  t.terms[WORKER] = { status: "working", screen: TEACH + "● Reading findings.md\n".repeat(40) + "✻ Working…\n❯ \n" };
  assert.equal((await t.fleet("captain", "send", LEAD, "Status?")).code, 0);
  assert.equal((await t.fleet("lead", "send", WORKER, "Carry on.")).code, 0);
  assert.deepEqual(t.sent, [{ to: LEAD, text: "Status?" }, { to: WORKER, text: "Carry on." }]);
});

test("fleet exec starts every Claude role with the Teach dialog turned off, and Codex and Devin without Claude's settings", async () => {
  const t = setup();
  const company = path.join(t.root, "acme");
  fs.mkdirSync(company);
  const roles = JSON.parse(fs.readFileSync(path.join(path.dirname(SCRIPT), "..", "roles.json"), "utf8")).roles;
  for (const [name, r] of Object.entries(roles)) {
    t.execs.length = 0;
    await t.fleetIn(company, "you", "exec", name, "Do the task.");
    const [argv] = t.execs;
    assert.equal(argv[0], r.run, name);
    const i = argv.indexOf("--settings");
    if (r.run === "claude") assert.deepEqual(JSON.parse(argv[i + 1]).skillOverrides, { "auto-mode-setup": "off" }, name);
    else assert.equal(i, -1, name);
  }
});
