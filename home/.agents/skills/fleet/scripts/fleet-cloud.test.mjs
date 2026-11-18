// Tests for `fleet cloud` against a fake Devin cloud REPL behind a mocked `hc`: node --test <this file>.
// The fake draws the screens a real session showed (devin v3000) and records what the brief was sent into.
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
const SEP = "─".repeat(40);
const MODELS = ["Fusion", "Ultra", "Normal", "Lite"];

// One Devin cloud REPL: its repos, model, open picker, transcript and the messages it got.
class FakeDevin {
  constructor({ repos = ["web", "backend", "ai-tools"], selected = [], model = "Normal", models = MODELS, history = "", url, collapse = false } = {}) {
    Object.assign(this, { repos, selected, model, models, history, url, collapse, input: "", picker: null, transcript: [], sent: [] });
  }
  repoRows() {
    const p = this.picker, rows = p.order.filter((r) => r.includes(p.search));
    return rows.map((r) => ({ label: r, on: p.sel.includes(r) }));
  }
  key(k) {
    const p = this.picker, ch = k === "space" ? " " : k;
    if (!p) {
      if (k === "enter" && this.input === "/repo") {
        const sel = this.selected; // the unfiltered list shows the selected repos first
        this.picker = { kind: "repo", search: "", cursor: 0, sel: [...sel], order: [...sel, ...this.repos.filter((r) => !sel.includes(r))] };
        this.transcript.push("❭ /repo");
      } else if (k === "alt+m") this.picker = { kind: "model", cursor: this.models.indexOf(this.model) };
      else if (ch.length === 1) this.input += ch;
      if (k === "enter") this.input = "";
      return;
    }
    if (p.kind === "model") {
      if (k === "up") p.cursor = Math.max(0, p.cursor - 1);
      if (k === "down") p.cursor = Math.min(this.models.length - 1, p.cursor + 1);
      if (k === "enter") this.model = this.models[p.cursor], this.transcript.push(` ✓ Capability set to ${this.model}`);
      if (k === "enter" || k === "esc") this.picker = null;
      return;
    }
    const rows = this.repoRows();
    if (k === "up") p.cursor = Math.max(0, p.cursor - 1);
    else if (k === "down") p.cursor = Math.min(rows.length - 1, p.cursor + 1);
    else if (k === "space") {
      const r = rows[p.cursor]?.label;
      if (r) p.sel = p.sel.includes(r) ? p.sel.filter((x) => x !== r) : [...p.sel, r];
    } else if (k === "esc") this.transcript.push(" Repository selection canceled."), (this.picker = null);
    else if (k === "enter") {
      this.selected = p.order.filter((r) => p.sel.includes(r));
      this.transcript.push(` ✓ Repositor${this.selected.length > 1 ? "ies" : "y"} set to ${this.selected.join(", ")}.`);
      this.picker = null;
    } else if (ch.length === 1) (p.search += ch), (p.cursor = 0);
  }
  send(text) {
    this.sent.push({ text, repos: [...this.selected], model: this.model });
    this.transcript.push(this.collapse ? "❭ [Pasted text #1]" : `❭ ${text.split("\n")[0]}`); // collapse: no trace of the text
    if (this.url) this.transcript.push(` Session: ${this.url}`);
  }
  screen(withHistory) {
    const head = [withHistory ? this.history : "", "  Devin CLI", "", ...this.transcript, ""];
    const p = this.picker;
    if (p?.kind === "repo")
      return [...head, DEVIN_Q, SEP, `/ ${p.search || "Type to search"}`, SEP,
        ...this.repoRows().map((r) => `${r.on ? "■" : "□"} ${r.label}`), "type search · ↑↓ select · ␣ toggle · ↵ confirm · esc cancel"].join("\n");
    if (p?.kind === "model")
      return [...head, SEP, "/ Type to search", SEP, ...this.models.map((m, i) => `${i === p.cursor ? "❭" : " "} ${m}`), "",
        "↑↓ select · ↵ confirm · esc cancel"].join("\n");
    return [...head, SEP, "❭ Ask Devin to build features, fix bugs, or work on your code", SEP,
      `Cloud · ${this.model}                    Press Ctrl+L to clear the screen`].join("\n");
  }
}
const DEVIN_Q = "Which repositories should Devin use?";

// A fleet in a temp work root with an active project sup-5182, a mocked hc, and fleet's main().
function setup({ devin = new FakeDevin(), terminal = null, sendFails = null } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-cloud-")));
  const home = path.join(root, ".fleet"), pdir = path.join(home, "projects", "sup-5182");
  for (const d of ["suppco", "functionhealth", ".fleet/projects/sup-5182/briefs"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  const prd = "## PRD\napproved\n";
  fs.writeFileSync(path.join(pdir, "prd.md"), prd);
  const hash = crypto.createHash("sha256").update("approved").digest("hex").slice(0, 16);
  fs.writeFileSync(path.join(pdir, "project.json"), JSON.stringify({ name: "sup-5182", lead: "lead-sup-5182", status: "active", prd_hash: hash }));
  fs.writeFileSync(path.join(root, "brief.md"), "Fix the flaky checkout test.\n");
  const calls = [];
  const env = { term: terminal, devin, launches: 0, sendFails };
  const hc = (args) => {
    const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
    const [cmd, name] = args;
    if (env.fails?.[cmd]) return { status: 1, stdout: "", stderr: `${cmd} failed` };
    if (cmd === "get") return env.term && env.term.name === name ? ok(JSON.stringify(env.term)) : { status: 1, stdout: "", stderr: "not_found" };
    if (cmd === "run") {
      const labels = {}, dash = args.indexOf("--");
      args.forEach((x, i) => x === "--label" && ((s) => (labels[s.split("=")[0]] = s.split("=")[1]))(args[i + 1]));
      env.term = { name: args[args.indexOf("--name") + 1], state: "live", cwd: args[args.indexOf("--cwd") + 1], labels, argv: args.slice(dash + 1) };
      env.launches++;
      return ok("{}");
    }
    if (cmd === "read") return ok(env.devin.screen(args[3] !== "0"));
    if (cmd === "keys") return args.slice(2).forEach((k) => env.devin.key(k)), ok();
    if (cmd === "send") {
      if (env.sendFails) return env.sendFails(args[2]);
      env.devin.send(args[2]);
      return ok();
    }
    return ok();
  };
  const spawnSync = (prog, args) => {
    calls.push([prog, ...args]);
    return prog === "hc" ? hc(args) : { status: 0, stdout: "", stderr: "" };
  };
  const run = (...argv) => {
    const outs = [], errs = [];
    let code = 0;
    const proc = { ...process, argv: ["node", SCRIPT, "cloud", ...argv],
      env: { PATH: process.env.PATH, FLEET_HOME: home, FLEET_ROLE: "lead", FLEET_PROJECT_DIR: pdir },
      stdout: { write: (s) => outs.push(s) }, stderr: { write: (s) => errs.push(s) },
      exit: (c) => { code = c; throw new Exit(); } };
    const ctx = vm.createContext({ require: (m) => (m === "node:child_process" ? { spawnSync } : require(m)),
      __filename: SCRIPT, process: proc, setTimeout, console, globalThis: {} });
    ctx.globalThis = ctx;
    vm.runInContext(SOURCE, ctx);
    return ctx.api.main().catch((e) => { if (!(e instanceof Exit)) throw e; })
      .then(() => ({ code, out: outs.join(""), err: errs.join("") }));
  };
  return { run, env, calls, root, briefs: path.join(pdir, "briefs") };
}
class Exit extends Error {}
const NAME = "sup-5182-cloud-agent-audit";
const suppco = (root, extra = {}) => ({ name: NAME, state: "live", cwd: path.join(root, "suppco"), argv: ["devin-as", "suppco", "--cloud"],
  labels: { "fleet.project": "sup-5182", "fleet.role": "cloud-agent", "fleet.company": "suppco" }, ...extra });

test("dry run: starts the account's session, sets web and Fusion, sends nothing", async () => {
  const t = setup();
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--dry-run");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual([...t.env.term.argv], ["devin-as", "suppco", "--cloud"]);
  assert.equal(t.env.term.labels["fleet.company"], "suppco");
  assert.deepEqual(t.env.devin.selected, ["web"]);
  assert.equal(t.env.devin.model, "Fusion");
  assert.equal(t.env.devin.sent.length, 0);
});

test("finding 1: a stale 'Repository set to web' in history does not skip /repo; the brief goes to web only", async () => {
  const devin = new FakeDevin({ selected: ["backend", "ai-tools"], model: "Fusion", history: " ✓ Repository set to web.\n ✓ Repository set to web." });
  const t = setup({ devin });
  t.env.term = suppco(t.root);
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(r.code, 0, r.err);
  assert.equal(devin.sent.length, 1);
  assert.deepEqual(devin.sent[0].repos, ["web"]);
  assert.equal(devin.sent[0].model, "Fusion");
});

test("finding 1: a /repo that does not end on the requested repo sends nothing", async () => {
  const devin = new FakeDevin();
  const key = devin.key.bind(devin);
  devin.key = (k) => (k === "enter" && devin.picker?.kind === "repo" ? ((devin.picker.sel = ["backend"]), key(k)) : key(k)); // Devin keeps another repo
  const t = setup({ devin });
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.notEqual(r.code, 0);
  assert.match(r.err, /Repository set to web\.' as \/repo's last line.*nothing was sent/s);
  assert.match(r.err, /fix: /);
  assert.equal(devin.sent.length, 0);
});

test("finding 2: --model is not accepted, and a session on Normal is moved to Fusion before the brief", async () => {
  const t = setup();
  const bad = await t.run("audit", "--company", "suppco", "--repo", "web", "--model", "Normal", "--brief", path.join(t.root, "brief.md"));
  assert.equal(bad.code, 2);
  assert.match(bad.err, /unrecognized argument --model/);
  assert.equal(t.env.launches, 0);
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(r.code, 0, r.err);
  assert.equal(t.env.devin.sent[0].model, "Fusion");
});

test("finding 2: no Fusion in the picker means no brief", async () => {
  const devin = new FakeDevin({ models: ["Ultra", "Normal"] });
  const t = setup({ devin });
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(r.code, 2);
  assert.match(r.err, /has no Fusion.*nothing was sent.*fix: /s);
  assert.equal(devin.sent.length, 0);
});

test("finding 3: the same slug under another company refuses the running suppco session", async () => {
  const t = setup();
  t.env.term = suppco(t.root);
  const r = await t.run("audit", "--company", "functionhealth", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(r.code, 2);
  assert.match(r.err, /is not this session \(company suppco, wanted functionhealth.*fix: /s);
  assert.equal(t.env.launches, 0);
  assert.equal(t.calls.filter((c) => c[1] === "keys" || c[1] === "send").length, 0);
});

test("finding 3: a terminal without the fleet.company label (or of another project) is never reused", async () => {
  const t = setup();
  t.env.term = suppco(t.root, { labels: { "fleet.project": "other", "fleet.role": "cloud-agent" } });
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--dry-run");
  assert.equal(r.code, 2);
  assert.match(r.err, /project other, wanted sup-5182; company unset, wanted suppco/);
  assert.equal(t.calls.filter((c) => c[1] === "keys").length, 0);
});

test("finding 4: a crash before hc send leaves a .sending marker; the rerun refuses until --resend", async () => {
  const t = setup();
  const brief = path.join(t.root, "brief.md");
  t.env.sendFails = () => { throw new Error("simulated crash just before hc send"); };
  await assert.rejects(t.run("audit", "--company", "suppco", "--repo", "web", "--brief", brief), /simulated crash/);
  assert.ok(fs.existsSync(path.join(t.briefs, `${NAME}.sending`)));
  t.env.sendFails = null;
  const keys = t.calls.filter((c) => c[1] === "keys").length;
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", brief);
  assert.equal(r.code, 2);
  assert.match(r.err, /began sending its brief and never confirmed it.*fix: `hc read .* --lines 500`; if the brief is not there, rerun with --resend/s);
  assert.equal(t.env.devin.sent.length, 0);
  assert.equal(t.calls.filter((c) => c[1] === "keys").length, keys); // refused before touching the session
  const again = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", brief, "--resend");
  assert.equal(again.code, 0, again.err);
  assert.equal(t.env.devin.sent.length, 1);
  assert.equal(t.env.launches, 1); // the same session, carried on
  assert.ok(fs.existsSync(path.join(t.briefs, `${NAME}.sent`)));
  assert.ok(!fs.existsSync(path.join(t.briefs, `${NAME}.sending`)));
});

test("re-check: a brief that arrived without a trace, then a crash before .sent, is never sent twice", async () => {
  const devin = new FakeDevin({ collapse: true }); // no role line and no URL in the history
  const t = setup({ devin });
  const brief = path.join(t.root, "brief.md");
  t.env.sendFails = (text) => { devin.send(text); throw new Error("simulated crash after hc send"); };
  await assert.rejects(t.run("audit", "--company", "suppco", "--repo", "web", "--brief", brief), /simulated crash/);
  t.env.sendFails = null;
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", brief);
  assert.equal(r.code, 2);
  assert.match(r.err, /rerun with --resend/);
  assert.equal(devin.sent.length, 1);
});

test("finding 4: a rerun after a confirmed brief refuses; nothing is inferred from the screen", async () => {
  const t = setup();
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(r.code, 0, r.err);
  assert.ok(fs.existsSync(path.join(t.briefs, `${NAME}.sent`)));
  assert.ok(!fs.existsSync(path.join(t.briefs, `${NAME}.sending`)));
  const again = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(again.code, 2);
  assert.match(again.err, /already got its brief.*rerun with --resend \(or use a new slug\)/s);
  assert.equal(t.env.devin.sent.length, 1);
});

test("re-check 3: once .sending exists, no failure path (hc get, launch, history read, send) clears it or sends again", async () => {
  const devin = new FakeDevin({ collapse: true });
  const t = setup({ devin });
  const brief = path.join(t.root, "brief.md"), sending = path.join(t.briefs, `${NAME}.sending`);
  const go = (...extra) => t.run("audit", "--company", "suppco", "--repo", "web", "--brief", brief, ...extra);
  t.env.sendFails = (text) => { devin.send(text); throw new Error("simulated crash after hc send"); };
  await assert.rejects(go(), /simulated crash/);
  t.env.sendFails = null;
  const fix = /hc read sup-5182-cloud-agent-audit --lines 500`; if the brief is not there, rerun with --resend \(or use a new slug\)/;
  // Each failure, then a plain retry: refused, marker kept, still one send. The session going away changes nothing either.
  for (const fails of [{ get: true }, { run: true }, { read: true }, { get: true, run: true }, {}]) {
    t.env.fails = fails;
    if (!fails.get) t.env.term = fails.run ? null : t.env.term; // a lost session: the next launch fails
    const r = await go();
    assert.equal(r.code, 2, JSON.stringify(fails) + r.err);
    assert.match(r.err, fix);
    assert.ok(fs.existsSync(sending), JSON.stringify(fails));
    t.env.fails = null;
    const retry = await go();
    assert.equal(retry.code, 2);
    assert.match(retry.err, fix);
    assert.equal(devin.sent.length, 1, JSON.stringify(fails));
  }
  // Even --resend, when hc get or the launch fails, leaves the marker and gives the same fix line.
  for (const fails of [{ get: true, run: true }, { run: true }]) {
    t.env.term = null;
    t.env.fails = fails;
    const r = await go("--resend");
    assert.notEqual(r.code, 0);
    assert.ok(fs.existsSync(sending));
    t.env.fails = null;
    assert.equal((await go()).code, 2);
    assert.equal(devin.sent.length, 1);
  }
  // A send that fails with no visible trace, and a history read that fails while checking it: marker kept, same fix line.
  t.env.term = null;
  t.env.sendFails = () => ((t.env.fails = { read: true }), { status: 1, stdout: "", stderr: "timed out" });
  const lost = await go("--resend");
  assert.equal(lost.code, 1);
  assert.match(lost.err, /arrival is not confirmed[\s\S]*/);
  assert.match(lost.err, fix);
  assert.ok(fs.existsSync(sending));
  t.env.sendFails = null, t.env.fails = null;
  assert.equal((await go()).code, 2);
  assert.equal(devin.sent.length, 1);
});

test("finding 4: a failed hc send that still arrived counts as sent; one that did not needs --resend", async () => {
  const t = setup();
  t.env.sendFails = (text) => (t.env.devin.send(text), { status: 1, stdout: "", stderr: "timed out" });
  const r = await t.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(t.root, "brief.md"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /reported a failure, but the brief is in the session/);
  const u = setup();
  u.env.sendFails = () => ({ status: 1, stdout: "", stderr: "timed out" });
  const lost = await u.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(u.root, "brief.md"));
  assert.equal(lost.code, 1);
  assert.match(lost.err, /arrival is not confirmed.*fix: .*rerun with --resend/s);
  u.env.sendFails = null;
  const refused = await u.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(u.root, "brief.md"));
  assert.equal(refused.code, 2);
  const retry = await u.run("audit", "--company", "suppco", "--repo", "web", "--brief", path.join(u.root, "brief.md"), "--resend");
  assert.equal(retry.code, 0, retry.err);
  assert.equal(u.env.devin.sent.length, 1);
});

test("finding 5: the session URL is printed for app.devin.ai and for an enterprise host", async () => {
  for (const [company, url] of [["suppco", "https://app.devin.ai/sessions/abc123"],
    ["functionhealth", "https://functionhealth.devinenterprise.com/sessions/def-456"]]) {
    const t = setup({ devin: new FakeDevin({ url }) });
    const r = await t.run("audit", "--company", company, "--repo", "web", "--brief", path.join(t.root, "brief.md"));
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, `${NAME}\n${url}\n`);
  }
});
