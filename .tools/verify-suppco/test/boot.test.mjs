// doctor/up/down: the pieces that run without booting the app (lib-up helpers, down against a temp root, exit codes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paths } from '../src/lib.mjs';
import { clearPort, groupAlive, listeners, readUp, rootPids, setUp, stopGroup, writeUp } from '../src/lib-up.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vs-boot-'));
const run = (args, env = {}) => spawnSync('node', [cli, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const fixLines = (stderr) => stderr.split('\n').filter((l) => l.startsWith('fix: '));
/** A detached process group (sh + sleep child) standing in for a server. Spawned through an intermediate node that
 *  exits, so (like a real `up`) the group is orphaned to launchd and reaped there, not left a zombie of this test. */
function sleeper() {
  const js = "const c=require('child_process').spawn('/bin/sh',['-c','sleep 60 & wait'],{detached:true,stdio:'ignore'});c.unref();console.log(c.pid)";
  return Number(spawnSync(process.execPath, ['-e', js], { encoding: 'utf8' }).stdout.trim());
}

test('rootPids keeps the master, drops its workers', () => {
  const ls = [{ pid: 10, ppid: 1 }, { pid: 11, ppid: 10 }, { pid: 12, ppid: 10 }, { pid: 20, ppid: 2 }];
  assert.deepEqual(rootPids(ls), [10, 20]);
});

test('setUp/readUp round trip; removing the last entry deletes up.json', () => {
  const P = paths(tmpRoot());
  setUp(P, 'api', { pid: 1, pgid: 1 });
  setUp(P, 'web', { pid: 2, pgid: 2 });
  assert.deepEqual(Object.keys(readUp(P)).sort(), ['api', 'web']);
  setUp(P, 'api', null); setUp(P, 'web', null);
  assert.equal(fs.existsSync(P.upState), false);
  assert.deepEqual(readUp(P), {});
});

test('stopGroup terminates the whole group', async () => {
  const pgid = sleeper();
  assert.equal(groupAlive(pgid), true);
  assert.equal(await stopGroup(pgid, { graceMs: 3000 }), 'term');
  assert.equal(groupAlive(pgid), false);
  assert.equal(await stopGroup(pgid), 'gone');
});

test('clearPort stops a listener verify-suppco did not start', async () => {
  // A detached node listening on a free port, orphaned like a real stray dev server.
  const js = "const c=require('child_process').spawn(process.execPath,['-e',\"require('net').createServer().listen(0,()=>process.stdout.write(''))\"],{detached:true,stdio:'ignore'});c.unref();console.log(c.pid)";
  const pid = Number(spawnSync(process.execPath, ['-e', js], { encoding: 'utf8' }).stdout.trim());
  let port = 0;
  for (let i = 0; i < 50 && !port; i++) {
    const m = spawnSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' }).stdout.match(/:(\d+)\n/);
    if (m) port = Number(m[1]); else await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(port, 'stray listener never bound');
  const stopped = await clearPort(port, { graceMs: 3000 });
  assert.deepEqual(stopped, [pid]);
  assert.equal(listeners(port).length, 0);
  assert.equal(groupAlive(pid), false);
  assert.deepEqual(await clearPort(port), []);
});

test('down with nothing recorded → exit 0, empty stdout', () => {
  const r = run(['down', '--root', tmpRoot()]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('down stops recorded groups and clears up.json; dead records are dropped silently', () => {
  const root = tmpRoot(); const P = paths(root);
  const pgid = sleeper();
  writeUp(P, { api: { pid: pgid, pgid, url: 'http://localhost:3000' }, web: { pid: 999999, pgid: 999999, url: 'https://localhost:3001' } });
  const r = run(['down', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^api: stopped pgid ${pgid}`));
  assert.doesNotMatch(r.stdout, /web/);
  assert.equal(groupAlive(pgid), false);
  assert.equal(fs.existsSync(P.upState), false);
});

test('up with a missing checkout → exit 2, one fix line', () => {
  const r = run(['up', '--root', tmpRoot()]);
  assert.equal(r.status, 2);
  assert.equal(fixLines(r.stderr).length, 1);
  assert.match(fixLines(r.stderr)[0], /^fix: git clone .*backend/);
  assert.equal(r.stdout, '');
});

test('up with remote targets only boots nothing', () => {
  const r = run(['up', '--root', tmpRoot(), '--web', 'staging', '--api', 'prod']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'web: https://staging.supp.co\napi: https://api.supp.co\n');
});

test('doctor: missing checkouts fail with the first fix; credentials only warn', () => {
  const r = run(['doctor', '--root', tmpRoot()], { PLAYWRIGHT_EMAIL: 'someone@example.com', PLAYWRIGHT_CODE: '' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL {2}backend\//m);
  assert.match(r.stdout, /^warn {2}\$PLAYWRIGHT_EMAIL .*does not end with test@monsterinbox\.com/m);
  assert.match(r.stdout, /^warn {2}\$PLAYWRIGHT_CODE +unset/m);
  assert.deepEqual(fixLines(r.stderr).length, 1);
  assert.match(fixLines(r.stderr)[0], /^fix: git clone .*backend/);
});

test('doctor: rails credentials warns on the placeholder shim, ok with master.key, never fails', () => {
  const root = tmpRoot();
  const cfg = path.join(root, 'backend/config');
  fs.mkdirSync(path.join(cfg, 'credentials'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backend/Gemfile'), '');
  fs.writeFileSync(path.join(cfg, 'credentials/development.key'), 'x');
  let r = run(['doctor', '--root', root]);
  assert.match(r.stdout, /^warn {2}rails credentials +placeholder shim: test@monsterinbox\.com login against --api local will be rejected {2}fix: printf '%s' '<RAILS_MASTER_KEY from Heroku config or a teammate>' > .*\/backend\/config\/master\.key && rm -rf .*\/backend\/config\/credentials$/m);
  assert.doesNotMatch(r.stderr, /rails credentials/);
  fs.writeFileSync(path.join(cfg, 'master.key'), 'x');
  r = run(['doctor', '--root', root]);
  assert.match(r.stdout, /^ok {4}rails credentials +real$/m);
});

test('doctor: env file line warns when missing or not 600, ok at 600', () => {
  const dir = tmpRoot(); const file = path.join(dir, 'env');
  let r = run(['doctor', '--root', dir], { VERIFY_SUPPCO_ENV: file });
  assert.match(r.stdout, new RegExp(`^warn {2}env file +${file} missing {2}fix: mkdir -p ${dir} && install -m 600 /dev/null ${file}$`, 'm'));
  fs.writeFileSync(file, ''); fs.chmodSync(file, 0o644);
  r = run(['doctor', '--root', dir], { VERIFY_SUPPCO_ENV: file });
  assert.match(r.stdout, /^warn {2}env file .*mode 644, not 600 {2}fix: chmod 600 /m);
  fs.chmodSync(file, 0o600);
  r = run(['doctor', '--root', dir], { VERIFY_SUPPCO_ENV: file });
  assert.match(r.stdout, new RegExp(`^ok {4}env file +${file}$`, 'm'));
});

test('up --api staging without OAUTH_CLIENT_SECRET_STAGING → exit 2 with the env-file fix, before touching anything', () => {
  const dir = tmpRoot(); const file = path.join(dir, 'env');
  const r = run(['up', '--root', dir, '--api', 'staging'], { VERIFY_SUPPCO_ENV: file, OAUTH_CLIENT_SECRET_STAGING: '' });
  assert.equal(r.status, 2);
  assert.deepEqual(fixLines(r.stderr), [`fix: echo 'OAUTH_CLIENT_SECRET_STAGING=<secret>' >> ${file}`]);
  assert.equal(r.stdout, '');
});
