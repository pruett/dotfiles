import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('./verify-suppco.mjs', import.meta.url));

// Every test runs against a throwaway $SUPPCO_ROOT: stub checkouts (just the marker files) and its own state.json, so the
// real ~/work/suppco state can never leak in and nothing here can touch it.
function tmpRoot(state = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-suppco-test-'));
  fs.mkdirSync(path.join(root, 'backend'), { recursive: true }); fs.writeFileSync(path.join(root, 'backend/Gemfile'), '');
  fs.mkdirSync(path.join(root, 'web/apps/web'), { recursive: true }); fs.writeFileSync(path.join(root, 'web/apps/web/package.json'), '{}');
  fs.mkdirSync(path.join(root, '.verify-suppco'), { recursive: true });
  fs.writeFileSync(path.join(root, '.verify-suppco/state.json'), JSON.stringify(state));
  return root;
}
const cliIn = (root, ...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, SUPPCO_ROOT: root, SUPP_DEV_TUNNEL: '', VERIFY_CWD: os.homedir() } });
const cliRun = (...args) => cliIn(tmpRoot(), ...args);
const env = (...args) => cliRun('env', '--api', 'local', ...args);
const lines = (r) => r.stdout.split('\n');

test('help exits 0; an unknown verb or flag exits 2', () => {
  assert.equal(cliRun('help').status, 0);
  assert.equal(cliRun('nope').status, 2);
  assert.equal(cliRun('env', '--bogus').status, 2);
});

test('tunnels reach the Rails issuer, web OAuth, API, and HMR', () => {
  const r = env('--tunnel', 'https://kevin-dev.supp.co/', '--api-tunnel', 'kevin-api.supp.co');
  assert.equal(r.status, 0, r.stderr);
  for (const line of [
    'SUPP_API_TUNNEL=kevin-api.supp.co',
    'RAILS_DEVELOPMENT_HOSTS=kevin-api.supp.co',
    'PUBLIC_API_URL=https://kevin-api.supp.co/api',
    'OAUTH_DOMAIN=https://kevin-api.supp.co/',
    'PUBLIC_OAUTH_DOMAIN=https://kevin-api.supp.co/',
    'PUBLIC_WS_URL=wss://kevin-api.supp.co/cable',
    'SUPP_DEV_TUNNEL=kevin-dev.supp.co',
    'HTTPS=true',
  ]) assert.ok(lines(r).includes(line), `Missing ${line}`);
});

test('clearing the tunnels restores localhost and leaves the backend on its own defaults', () => {
  const r = env('--tunnel', '', '--api-tunnel', '');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^PUBLIC_API_URL=http:\/\/localhost:3000\/api$/m);
  assert.match(r.stdout, /^SUPP_DEV_TUNNEL=$/m);
  assert.ok(!r.stdout.includes('SUPP_API_TUNNEL='), 'SUPP_API_TUNNEL must be unset without an API tunnel');
  assert.ok(!r.stdout.includes('RAILS_DEVELOPMENT_HOSTS='));
});

test('tunnel hosts cannot contain credentials, ports, paths or http://', () => {
  for (const host of ['https://user:secret@kevin-api.supp.co', 'kevin-api.supp.co/path', 'http://kevin-api.supp.co', 'localhost:3000']) {
    const r = env('--api-tunnel', host);
    assert.equal(r.status, 2, host);
    assert.match(r.stderr, /hostname|HTTPS/);
    assert.ok(!r.stderr.includes('secret'));
  }
});

test('--api rejects unknown targets', () => {
  const r = cliRun('env', '--api', 'qa');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /local\|staging\|prod/);
});

test('a remembered --web checkout that no longer exists is refused by name, and --web web points back at the main clone from any cwd', () => {
  const root = tmpRoot({ config: { api: 'local', webDir: path.join(root0(), 'gone-worktree') } });
  const r = cliIn(root, 'env', '--api', 'local');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /web checkout .*gone-worktree no longer exists/);
  assert.match(r.stderr, /verify-suppco up --web web/);
  assert.ok(!r.stdout.includes('PUBLIC_API_URL='), 'env must not print a config it refuses');
  // `--web web` from a cwd that has no ./web (VERIFY_CWD is $HOME above) resolves to $SUPPCO_ROOT/web and drops webDir.
  const fixed = cliIn(root, 'env', '--api', 'local', '--web', 'web');
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.doesNotMatch(fixed.stdout.split('\n')[0], /webDir/);
  function root0() { return path.join(os.tmpdir(), 'verify-suppco-test-nowhere'); }
});

test('--version prints the package.json semver and the checkout short sha', () => {
  const r = cliRun('--version');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\d+\.\d+\.\d+ \([0-9a-f]{7,}\)\n$/);
});

test('doctor --json prints the rows array (with an ffmpeg row) and creates the videos dir', () => {
  const root = tmpRoot();
  const r = cliIn(root, 'doctor', '--json');
  const rows = JSON.parse(r.stdout);
  assert.ok(Array.isArray(rows) && rows.length >= 15, `only ${rows.length} rows`);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['detail', 'fix', 'name', 'status']);
  const ff = rows.find((x) => x.name === 'ffmpeg (recordings → mp4)');
  assert.ok(ff && ['ok', 'warn'].includes(ff.status));
  assert.ok(fs.statSync(path.join(root, '.verify-suppco/videos')).isDirectory());
});

// A stand-in for @playwright/test under the stub web checkout: pages "record" a webm into recordVideo.dir with a random name
// on context close (as Playwright does), and every newContext() option set is appended to <root>/contexts.jsonl.
const FAKE_PLAYWRIGHT = `
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../../..');
function newPage(ctx) {
  let url = ctx.opts.baseURL, video = null;
  if (ctx.opts.recordVideo) video = path.join(ctx.opts.recordVideo.dir, crypto.randomBytes(8).toString('hex') + '.webm');
  const locator = { first: () => locator, waitFor: async () => {}, innerText: async () => 'hello', screenshot: async ({ path: p }) => fs.writeFileSync(p, 'png') };
  const page = {
    on() {}, goto: async (r) => { url = new URL(r, ctx.opts.baseURL).href; return { status: () => 200 }; },
    waitForLoadState: async () => {}, locator: () => locator, screenshot: async ({ path: p }) => fs.writeFileSync(p, 'png'),
    url: () => url, title: async () => 'Today', video: () => video && { path: async () => video },
    _close: () => video && fs.writeFileSync(video, 'webm-bytes'),
  };
  return page;
}
exports.chromium = { async launch() { return { async newContext(opts) {
  fs.appendFileSync(path.join(root, 'contexts.jsonl'), JSON.stringify(opts) + '\\n');
  const listeners = [], pages = [];
  const ctx = { opts, on: (e, f) => e === 'page' && listeners.push(f), tracing: { start: async () => {}, stop: async ({ path: p }) => fs.writeFileSync(p, 'zip') },
    async newPage() { const p = newPage(ctx); pages.push(p); listeners.forEach((f) => f(p)); return p; },
    async close() { pages.splice(0).forEach((p) => p._close()); } };
  return ctx;
}, async close() {} }; } };
`;
function pwRoot() {
  const root = tmpRoot();
  const pkg = path.join(root, 'web/apps/web/node_modules/@playwright/test');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"@playwright/test","main":"index.js"}');
  fs.writeFileSync(path.join(pkg, 'index.js'), FAKE_PLAYWRIGHT);
  // A fresh prod session so `--as` resolves without a login.
  fs.mkdirSync(path.join(root, '.verify-suppco/auth'), { recursive: true });
  fs.writeFileSync(path.join(root, '.verify-suppco/auth/x@example.com.json'), JSON.stringify({ email: 'x@example.com', api: 'prod', expiresAt: Date.now() / 1000 + 3600, storageState: { cookies: [], origins: [] } }));
  return root;
}
const withFeature = (root, feature, ...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, SUPPCO_ROOT: root, SUPP_DEV_TUNNEL: '', VERIFY_CWD: root, VERIFY_FEATURE: feature } });
const runJsons = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.run.json')).map((f) => ({ f, rec: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
const RUN_KEYS = ['argv', 'artifacts', 'exitCode', 'feature', 'startedAt', 'verb'];

test('shot --video records <stamp>-<slug>-<user>.webm, names it in the sidecar and result, and writes run.json beside the png', () => {
  const root = pwRoot();
  const r = withFeature(root, 'today-feed', 'shot', '/home/today', '--as', 'x@example.com', '--video', '--json');
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  const videos = path.join(root, '.verify-suppco/videos');
  assert.equal(path.dirname(result.video), videos);
  assert.match(path.basename(result.video), /^\d{4}-\d\d-\d\dT[\d-]+Z-home-today-x\.webm$/);
  assert.ok(fs.statSync(result.video).size > 0);
  assert.deepEqual(fs.readdirSync(videos), [path.basename(result.video)], 'the raw Playwright webm must be renamed, not copied');
  assert.deepEqual(JSON.parse(fs.readFileSync(result.file.replace(/\.png$/, '.json'), 'utf8')).video, result.video);
  const ctx = JSON.parse(fs.readFileSync(path.join(root, 'contexts.jsonl'), 'utf8'));
  assert.deepEqual(ctx.recordVideo, { dir: videos });

  const [{ f, rec }] = runJsons(path.dirname(result.file));
  assert.equal(f, path.basename(result.file, '.png') + '.run.json');
  assert.deepEqual(Object.keys(rec).sort(), RUN_KEYS);
  assert.equal(rec.verb, 'shot');
  assert.deepEqual(rec.argv, ['shot', '/home/today', '--as', 'x@example.com', '--video', '--json']);
  assert.ok(!Number.isNaN(Date.parse(rec.startedAt)));
  assert.equal(rec.exitCode, 0);
  assert.equal(rec.feature, 'today-feed');
  assert.deepEqual(rec.artifacts, [result.file, result.file.replace(/\.png$/, '.json'), result.video]);
});

test('shot without --video records nothing and still writes run.json (feature null without VERIFY_FEATURE)', () => {
  const root = pwRoot();
  const r = withFeature(root, '', 'shot', '/', '--json');
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.ok(!('video' in result));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'contexts.jsonl'), 'utf8')).recordVideo, undefined);
  const [{ rec }] = runJsons(path.join(root, '.verify-suppco/shots'));
  assert.equal(rec.feature, null);
  assert.deepEqual(rec.artifacts, [result.file, result.file.replace(/\.png$/, '.json')]);
});

test('pw --video adds `video` to the result; run.json lists the script shots and the video, and a failing script records exit 1', () => {
  const root = pwRoot();
  const script = path.join(root, 'flow.mjs');
  fs.writeFileSync(script, `import path from 'node:path'; export default async ({ page, shots }) => { await page.goto('/x'); await page.screenshot({ path: path.join(shots, 'step-1.png') }); return { ok: true }; };`);
  const r = withFeature(root, 'flow', 'pw', script, '--video');
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.ok, true);
  assert.match(path.basename(result.video), /-flow\.webm$/);
  assert.ok(fs.statSync(result.video).size > 0);
  const shots = path.join(root, '.verify-suppco/shots');
  const [{ f, rec }] = runJsons(shots);
  assert.equal(f, path.basename(result.video, '.webm') + '.run.json');
  assert.deepEqual(Object.keys(rec).sort(), RUN_KEYS);
  assert.equal(rec.verb, 'pw');
  assert.equal(rec.exitCode, 0);
  assert.equal(rec.feature, 'flow');
  assert.deepEqual(rec.artifacts, [path.join(shots, 'step-1.png'), result.video]);

  const bad = path.join(root, 'bad.mjs');
  fs.writeFileSync(bad, `export default async () => { throw new Error('boom'); };`);
  const b = withFeature(root, '', 'pw', bad);
  assert.equal(b.status, 1);
  const failed = runJsons(shots).find(({ f }) => f.endsWith('-bad.run.json'));
  assert.equal(failed.rec.exitCode, 1);
  assert.deepEqual(failed.rec.artifacts, []);
});

// A stand-in `xcrun` on PATH: `simctl list devices available -j` prints two iOS simulators (one booted) and a watchOS one;
// `simctl io <udid> screenshot <file>` writes the file. Every call is appended to <root>/xcrun.log.
function xcrunRoot({ screenshotFails = false } = {}) {
  const root = tmpRoot({ ios: { target: 'dev', origin: 'https://kevin-dev.supp.co' } });
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const devices = { devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
      { name: 'iPhone 16', udid: 'AAAA-1111', state: 'Booted', isAvailable: true },
      { name: 'iPad Air', udid: 'BBBB-2222', state: 'Shutdown', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.watchOS-11-2': [{ name: 'Watch', udid: 'CCCC-3333', state: 'Shutdown', isAvailable: true }],
  } };
  fs.writeFileSync(path.join(bin, 'xcrun'), `#!/bin/sh
echo "$@" >> '${root}/xcrun.log'
case "$*" in
  "simctl list devices available -j") cat <<'JSON'
${JSON.stringify(devices)}
JSON
  ;;
  "simctl io "*" screenshot "*) ${screenshotFails ? 'echo "Invalid device state" >&2; exit 1' : 'for f; do :; done; printf png > "$f"'} ;;
  "simctl io "*" recordVideo --codec h264 "*) for f; do :; done; trap 'printf mov > "$f"; exit 0' INT; while :; do sleep 0.05; done ;;
  "simctl spawn "*" log show "*) for i in 1 2 3 4 5; do echo "App[1:$i] line $i"; done; echo "App[1:9] GET /boom" ;;
  "simctl spawn "*" log stream "*) echo "App[1:1] streamed GET /a"; echo "App[1:2] streamed POST /b"; while :; do sleep 0.05; done ;;
  *) exit 64 ;;
esac
`, { mode: 0o755 });
  return root;
}
const iosCli = (root, ...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`, SUPPCO_ROOT: root, SUPP_DEV_TUNNEL: '', VERIFY_CWD: root } });

test('ios devices --json prints the iOS simulators as {name,udid,state,runtime}', () => {
  const r = iosCli(xcrunRoot(), 'ios', 'devices', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [
    { name: 'iPhone 16', udid: 'AAAA-1111', state: 'Booted', runtime: 'iOS-18-2' },
    { name: 'iPad Air', udid: 'BBBB-2222', state: 'Shutdown', runtime: 'iOS-18-2' },
  ]);
});

test('ios shot screenshots the booted simulator into shots/<stamp>-ios-<device>.png with a sidecar and run.json', () => {
  const root = xcrunRoot();
  const r = iosCli(root, 'ios', 'shot', '--json');
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  const shots = path.join(root, '.verify-suppco/shots');
  assert.equal(path.dirname(result.file), shots);
  assert.match(path.basename(result.file), /^\d{4}-\d\d-\d\dT[\d-]+Z-ios-iPhone-16\.png$/);
  assert.ok(fs.statSync(result.file).size > 0);
  assert.match(fs.readFileSync(path.join(root, 'xcrun.log'), 'utf8'), new RegExp(`^simctl io AAAA-1111 screenshot ${result.file}$`, 'm'));
  const sidecar = JSON.parse(fs.readFileSync(result.file.replace(/\.png$/, '.json'), 'utf8'));
  assert.deepEqual(sidecar, { file: result.file, device: 'iPhone 16', udid: 'AAAA-1111', target: 'dev', origin: 'https://kevin-dev.supp.co' });
  const [{ rec }] = runJsons(shots);
  assert.equal(rec.verb, 'ios');
  assert.deepEqual(rec.argv, ['ios', 'shot', '--json']);
  assert.equal(rec.exitCode, 0);
  assert.deepEqual(rec.artifacts, [result.file, result.file.replace(/\.png$/, '.json')]);
});

test('ios shot --device/--out: by name or udid; a shut-down or unknown device and a simctl failure exit 1', () => {
  const root = xcrunRoot();
  const r = iosCli(root, 'ios', 'shot', '--device', 'AAAA-1111', '--out', 'here/a.png');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(root, 'here/a.png')) && fs.existsSync(path.join(root, 'here/a.json')));
  const off = iosCli(root, 'ios', 'shot', '--device', 'iPad Air');
  assert.equal(off.status, 1);
  assert.match(off.stderr, /iPad Air is Shutdown/);
  assert.equal(iosCli(root, 'ios', 'shot', '--device', 'nope').status, 1);
  const broken = xcrunRoot({ screenshotFails: true });
  const b = iosCli(broken, 'ios', 'shot');
  assert.equal(b.status, 1);
  assert.match(b.stderr, /Invalid device state/);
  const [{ rec }] = runJsons(path.join(broken, '.verify-suppco/shots'));
  assert.equal(rec.exitCode, 1);
  assert.deepEqual(rec.artifacts, []);
});

const iosEnv = (root) => ({ ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`, SUPPCO_ROOT: root, SUPP_DEV_TUNNEL: '', VERIFY_CWD: root });
const statusIos = (root) => { const r = iosCli(root, 'status', '--json'); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).ios; };

test('ios record start|stop: pid in state.json ios.recording only while live, SIGINT finalises a .mov in videos/ with a run.json', () => {
  const root = xcrunRoot();
  const start = iosCli(root, 'ios', 'record', 'start', '--json');
  assert.equal(start.status, 0, start.stderr);
  const rec = JSON.parse(start.stdout);
  assert.match(path.basename(rec.file), /^\d{4}-\d\d-\d\dT[\d-]+Z-ios-iPhone-16\.mov$/);
  assert.equal(path.dirname(rec.file), path.join(root, '.verify-suppco/videos'));
  assert.deepEqual(statusIos(root).recording, rec);
  assert.equal(statusIos(root).target, 'dev', 'sync state is kept beside the recording');
  assert.match(fs.readFileSync(path.join(root, 'xcrun.log'), 'utf8'), new RegExp(`^simctl io AAAA-1111 recordVideo --codec h264 ${rec.file}$`, 'm'));
  assert.equal(iosCli(root, 'ios', 'record', 'start').status, 1, 'a second start is refused');
  const stop = iosCli(root, 'ios', 'record', 'stop', '--json');
  assert.equal(stop.status, 0, stop.stderr);
  const done = JSON.parse(stop.stdout);
  assert.equal(done.file, rec.file);
  assert.ok(fs.statSync(rec.file).size > 0 && done.bytes > 0);
  assert.equal(statusIos(root).recording, undefined);
  assert.equal(statusIos(root).target, 'dev');
  assert.throws(() => process.kill(rec.pid, 0));
  const [{ rec: run }] = runJsons(path.join(root, '.verify-suppco/videos'));
  assert.deepEqual([run.verb, run.exitCode, run.artifacts], ['ios', 0, [rec.file]]);
  const again = iosCli(root, 'ios', 'record', 'stop');
  assert.equal(again.status, 1);
  assert.match(again.stderr, /not recording/);
  assert.equal(iosCli(root, 'ios', 'record', 'pause').status, 2);
});

test('ios logs: last -n lines of log show filtered by --grep; -f streams log stream until killed', async () => {
  const root = xcrunRoot();
  const r = iosCli(root, 'ios', 'logs', '-n', '2');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lines(r).filter(Boolean), ['App[1:5] line 5', 'App[1:9] GET /boom']);
  assert.match(fs.readFileSync(path.join(root, 'xcrun.log'), 'utf8'), /^simctl spawn AAAA-1111 log show --last 10m --style compact --predicate processImagePath contains "App"$/m);
  assert.deepEqual(lines(iosCli(root, 'ios', 'logs', '--grep', 'line [24]')).filter(Boolean), ['App[1:2] line 2', 'App[1:4] line 4']);
  assert.equal(iosCli(root, 'ios', 'logs', '--grep', '(').status, 2);
  const child = spawn(process.execPath, [cli, 'ios', 'logs', '-f', '--grep', 'POST'], { env: iosEnv(root) });
  let got = '';
  child.stdout.on('data', (d) => (got += d));
  const deadline = Date.now() + 5000;
  while (!got.includes('\n') && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
  assert.equal(got, 'App[1:2] streamed POST /b\n');
  assert.equal(child.exitCode, null, 'still streaming');
  child.kill('SIGTERM');
  await new Promise((res) => child.on('close', res));
});

// A fixture .verify-suppco/ evidence tree: two shot runs (one per feature), a pw run whose run.json in shots/ lists a trace and
// a video, and an orphan trace with no run.json. Files are written in place of real captures.
function evidenceRoot() {
  const root = tmpRoot(), s = path.join(root, '.verify-suppco');
  const put = (rel, body = 'x') => { const f = path.join(s, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body)); return f; };
  const run = (rel, rec) => put(rel, { argv: [], exitCode: 0, ...rec });
  const home = ['shots/2026-09-20T10-00-00-000Z-home-today-kevin.png', 'shots/2026-09-20T10-00-00-000Z-home-today-kevin.json'].map((r) => put(r, r.endsWith('.json') ? {
    requested: '/home/today', url: 'https://localhost:3001/login', redirected: true, title: 'Log in', status: 200, errorPage: false,
    network: { console: [{ type: 'error', text: 'boom `x`' }, { type: 'warning', text: 'meh' }], pageErrors: ['TypeError: y'], failed: [{ method: 'GET', url: 'https://api.supp.co/api/me', status: 401 }] },
  } : 'png'));
  run('shots/2026-09-20T10-00-00-000Z-home-today-kevin.run.json', { verb: 'shot', argv: ['shot', '/home/today', '--as', 'kevin@x.co'], startedAt: '2026-09-20T10:00:00.000Z', artifacts: home, feature: 'home-render' });
  const odd = ['shots/2026-09-21T09-00-00-000Z-market (a b).png', 'shots/2026-09-21T09-00-00-000Z-market (a b).json'].map((r) => put(r, r.endsWith('.json') ? { requested: '/marketplace', url: 'https://localhost:3001/marketplace', redirected: false, status: 500, errorPage: true, network: { console: [], pageErrors: [], failed: [] } } : 'png'));
  run('shots/2026-09-21T09-00-00-000Z-market (a b).run.json', { verb: 'shot', argv: ['shot', '/marketplace'], startedAt: '2026-09-21T09:00:00.000Z', exitCode: 1, artifacts: odd, feature: 'marketplace' });
  const pw = [put('traces/2026-09-22T08-00-00-000Z-flow.zip'), put('videos/2026-09-22T08-00-00-000Z-flow.webm')];
  run('shots/2026-09-22T08-00-00-000Z-flow.run.json', { verb: 'pw', argv: ['pw', 'flow.mjs', '--video'], startedAt: '2026-09-22T08:00:00.000Z', artifacts: pw, feature: 'home-render' });
  put('traces/2026-09-19T07-00-00-000Z-old.zip');
  return root;
}
const reportLinks = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)].map((m) => path.resolve(path.dirname(file), decodeURI(m[1]).replace(/%28/g, '(').replace(/%29/g, ')')));

test('report writes reports/<stamp>.md: runs newest first, sidecar summaries, orphans grouped, every link resolves', () => {
  const root = evidenceRoot();
  const r = cliIn(root, 'report');
  assert.equal(r.status, 0, r.stderr);
  const file = r.stdout.trim();
  assert.match(path.relative(root, file), /^\.verify-suppco\/reports\/\d{4}-\d{2}-\d{2}T[\d-]+Z\.md$/);
  const text = fs.readFileSync(file, 'utf8');
  const heads = text.split('\n').filter((l) => l.startsWith('## '));
  assert.deepEqual(heads.map((h) => h.slice(3, 27)), ['2026-09-22T08:00:00.000Z', '2026-09-21T09:00:00.000Z', '2026-09-20T10:00:00.000Z', '2026-09-19T07:00:00.000Z']);
  assert.match(heads[3], /artifacts without run\.json/);
  assert.match(text, /- Runs: 4 · artifacts: 7/);
  for (const s of ['entry point `/home/today`', 'final URL `https://localhost:3001/login`', '**REDIRECTED**', '**ERROR PAGE**', 'status 500',
    "console `boom 'x'`", 'page error `TypeError: y`', 'failed `401 GET https://api.supp.co/api/me`', 'errors (3):', 'errors: none', 'Feature: `home-render`', 'Exit: 1'])
    assert.ok(text.includes(s), `missing ${s}`);
  assert.ok(!text.includes('meh'), 'console warnings are not errors');
  const links = reportLinks(file);
  assert.equal(links.length, 7 + 3);
  for (const l of links) assert.ok(fs.existsSync(l), `dangling link ${l}`);
});

test('report --feature/--since select runs; --out places the file and links stay relative to it; a bad --since exits 2', () => {
  const root = evidenceRoot();
  const out = path.join(root, 'elsewhere/r.md');
  const r = cliIn(root, 'report', '--feature', 'home-render', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), out);
  const text = fs.readFileSync(out, 'utf8');
  assert.equal(text.split('\n').filter((l) => l.startsWith('## ')).length, 2);
  assert.match(text, /- Filters: feature `home-render`/);
  assert.ok(!text.includes('marketplace') && !text.includes('old.zip'));
  for (const l of reportLinks(out)) assert.ok(fs.existsSync(l), `dangling link ${l}`);
  const again = cliIn(root, 'report', '--feature', 'home-render', '--out', out);
  assert.equal(fs.readFileSync(out, 'utf8'), text, 'same selection → byte-identical output');
  assert.equal(again.status, 0);

  const since = cliIn(root, 'report', '--since', '2026-09-21T00:00:00Z', '--out', out);
  assert.equal(since.status, 0, since.stderr);
  assert.equal(fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.startsWith('## ')).length, 2);
  const stampSince = cliIn(root, 'report', '--since', '2026-09-22T08-00-00-000Z', '--out', out);
  assert.equal(stampSince.status, 0, stampSince.stderr);
  assert.equal(fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.startsWith('## ')).length, 1);
  assert.equal(cliIn(root, 'report', '--since', 'yesterday-ish').status, 2);
});
