// src/help.mjs is the source of truth: every verb's `--help` output must match it byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HELP } from '../src/help.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
const run = (...args) => spawnSync('node', [cli, ...args], { encoding: 'utf8' });

test('help.mjs carries root plus the six verbs', () => {
  assert.deepEqual(Object.keys(HELP).sort(), ['doctor', 'down', 'login', 'pw', 'root', 'shot', 'up']);
});

for (const [verb, text] of Object.entries(HELP)) {
  test(`verify-suppco ${verb === 'root' ? '' : verb + ' '}--help prints help.mjs`, () => {
    const r = verb === 'root' ? run('--help') : run(verb, '--help');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, text);
    assert.equal(r.stderr, '');
  });
}

test('no verb → exit 2 with a fix line on stderr', () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^fix: /m);
  assert.equal(r.stdout, '');
});

test('unknown verb → exit 2 with a fix line', () => {
  const r = run('bogus');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown verb/);
  assert.match(r.stderr, /^fix: /m);
});
