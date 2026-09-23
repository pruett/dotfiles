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
