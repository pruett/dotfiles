// pw/shot argument and precondition layer: everything that must exit 2 before a browser launches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-suppco-drive-'));   // empty root: no sessions, no checkouts
const script = path.join(root, 'ok.mjs');
fs.writeFileSync(script, 'export default async () => 1;\n');
const run = (...args) => spawnSync('node', [cli, ...args], {
  encoding: 'utf8',
  env: { ...process.env, SUPPCO_ROOT: root, VERIFY_SUPPCO_CWD: root, PLAYWRIGHT_EMAIL: '', PLAYWRIGHT_CODE: '' },
});
const usage = (r, re) => {
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, re);
  assert.equal(r.stderr.match(/^fix: /gm)?.length, 1, r.stderr);
};

test('pw without a script → 2', () => usage(run('pw'), /missing <script\.mjs>/));
test('pw with two scripts → 2', () => usage(run('pw', 'a.mjs', 'b.mjs'), /one script/));
test('pw script not found (relative to the caller cwd) → 2', () => usage(run('pw', 'nope.mjs'), new RegExp(`script not found: ${path.join(root, 'nope.mjs')}`)));
test('pw unknown flag → 2', () => usage(run('pw', 'ok.mjs', '--bogus'), /unknown flag --bogus/));
test('pw --as without a session → 2, fix is login', () => usage(run('pw', 'ok.mjs', '--as', 'ghost@x.com'), /^fix: verify-suppco login ghost@x\.com$/m));
test('pw $PLAYWRIGHT_EMAIL without a session → 2', () => {
  const r = spawnSync('node', [cli, 'pw', 'ok.mjs'], { encoding: 'utf8', env: { ...process.env, SUPPCO_ROOT: root, VERIFY_SUPPCO_CWD: root, PLAYWRIGHT_EMAIL: 'env@x.com' } });
  usage(r, /^fix: verify-suppco login env@x\.com$/m);
});
test('pw bad --web → 2', () => usage(run('pw', 'ok.mjs', '--web', 'moon'), /--web must be/));

test('shot without a route → 2', () => usage(run('shot'), /missing <route>/));
test('shot bad --viewport → 2', () => usage(run('shot', '/', '--viewport', 'big'), /--viewport must be <W>x<H>/));
test('shot --as without a session → 2, fix is login', () => usage(run('shot', '/', '--as', 'ghost@x.com'), /^fix: verify-suppco login ghost@x\.com$/m));
test('shot --selector needs a value → 2', () => usage(run('shot', '/', '--selector'), /--selector needs a value/));

test('nothing written for precondition failures', () => {
  assert.equal(fs.existsSync(path.join(root, '.verify-suppco', 'runs')), false);
});

test('remote --web needs no checkout: Playwright resolves from the CLI dir, no :3001 probe', async () => {
  const { paths, resolveTargets } = await import('../src/lib.mjs');
  const { drivePlaywright, requireWeb } = await import('../src/lib-drive.mjs');
  const P = paths(root);   // empty root: no web/ checkout
  const targets = resolveTargets({ web: 'https://supp.co', api: 'prod' });
  assert.equal(typeof drivePlaywright(P, targets).chromium?.launch, 'function');
  await requireWeb(targets);   // must not throw even though nothing runs on :3001 in the test
  assert.equal(fs.existsSync(P.web), false);
});

test('errorPageReason: SvelteKit error boundary and generic error pages are errors', async () => {
  const { errorPageReason } = await import('../src/lib-drive.mjs');
  const hits = [
    { title: 'Oops. - SuppCo', headings: ['Oops.', 'Error: Internal Error'] },   // +error.svelte 500 rendered with HTTP 200
    { title: 'SuppCo', headings: ['Error: Internal Error'] },
    { title: 'SuppCo', headings: ['Internal Server Error'] },
    { title: 'Unauthorized - SuppCo', headings: ['Unauthorized'] },
    { title: 'Connection Issue - SuppCo', headings: [] },
    { title: '', headings: ['Something went wrong'] },
    { title: '', headings: ['Page not found'] },
  ];
  for (const h of hits) assert.ok(errorPageReason(h), JSON.stringify(h));
  assert.match(errorPageReason(hits[0]), /title 'Oops\. - SuppCo'/);
});

test('errorPageReason: normal pages pass', async () => {
  const { errorPageReason } = await import('../src/lib-drive.mjs');
  const misses = [
    { title: 'SuppCo: Supplement Tracker & Optimizer for 230,000+ Products', headings: ['The smartest way to take supplements'] },
    { title: 'Home - SuppCo', headings: ['My stack', 'See what you could save with the Buying Club'] },
    { title: 'Oopsie Daisy Gummies - SuppCo', headings: ['Avoiding common errors when dosing magnesium'] },
    { title: 'Settings - SuppCo', headings: ['Error reporting preferences'] },
    {},
  ];
  for (const m of misses) assert.equal(errorPageReason(m), null, JSON.stringify(m));
});
