import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
