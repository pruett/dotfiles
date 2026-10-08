// login's arg/precondition layer: no browser, no network beyond a closed local port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, answers } from '../src/verbs/login.mjs';
import { CliError } from '../src/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
// CLI subprocesses never read the developer's .env next to the CLI.
const env = (o) => { const e = { ...process.env, VERIFY_SUPPCO_ENV: '/nonexistent', ...o }; for (const k of Object.keys(o)) if (o[k] === undefined) delete e[k]; return e; };
const withEnv = (o, fn) => {
  const saved = Object.fromEntries(Object.keys(o).map((k) => [k, process.env[k]]));
  Object.assign(process.env, o); for (const k of Object.keys(o)) if (o[k] === undefined) delete process.env[k];
  try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};
const throwsCode = (fn, code, fix) => assert.throws(fn, (e) => e instanceof CliError && e.code === code && (!fix || fix.test(e.fix)));

test('email: positional wins over $PLAYWRIGHT_EMAIL', () => {
  withEnv({ PLAYWRIGHT_EMAIL: 'env@x', PLAYWRIGHT_CODE: undefined }, () => {
    assert.equal(parse(['flag@x']).email, 'flag@x');
    assert.equal(parse([]).email, 'env@x');
  });
});

test('code: --code wins over $PLAYWRIGHT_CODE; empty means headed', () => {
  withEnv({ PLAYWRIGHT_EMAIL: 'e@x', PLAYWRIGHT_CODE: '111111' }, () => {
    assert.equal(parse(['--code', '222222']).code, '222222');
    assert.equal(parse(['--code=333333']).code, '333333');
    assert.equal(parse([]).code, '111111');
  });
  withEnv({ PLAYWRIGHT_EMAIL: 'e@x', PLAYWRIGHT_CODE: undefined }, () => assert.equal(parse([]).code, ''));
});

test('no email anywhere → exit 2 with an export fix', () => {
  withEnv({ PLAYWRIGHT_EMAIL: undefined }, () => throwsCode(() => parse([]), 2, /^export PLAYWRIGHT_EMAIL=<you>test@monsterinbox\.com$/));
});

test('two positionals or an unknown flag → exit 2', () => {
  withEnv({ PLAYWRIGHT_EMAIL: 'e@x' }, () => {
    throwsCode(() => parse(['a@x', 'b@x']), 2);
    throwsCode(() => parse(['--as', 'a@x']), 2);
    throwsCode(() => parse(['--code']), 2);
  });
});

test('answers() is false for a closed port', async () => {
  assert.equal(await answers('https://localhost:1', 2000), false);
});

test('CLI: no email → exit 2, error + fix on stderr, nothing on stdout', () => {
  const r = spawnSync('node', [cli, 'login'], { encoding: 'utf8', env: env({ PLAYWRIGHT_EMAIL: undefined, PLAYWRIGHT_CODE: undefined }) });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^error: no email given and \$PLAYWRIGHT_EMAIL unset\nfix: export PLAYWRIGHT_EMAIL=<you>test@monsterinbox\.com\n$/);
});

test('CLI: the code is never echoed on a usage error', () => {
  const r = spawnSync('node', [cli, 'login', 'a@x', 'b@x', '--code', '987654'], { encoding: 'utf8', env: env({ PLAYWRIGHT_CODE: '456789' }) });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /987654|456789/);
});

test('rejection: human-verification flash on a placeholder local backend explains the cause', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { rejection } = await import('../src/verbs/login.mjs');
  const { paths } = await import('../src/lib.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'login-'));
  const P = paths(root);
  fs.mkdirSync(path.join(P.backend, 'config/credentials'), { recursive: true });
  const retry = 'verify-suppco login a@x';
  const human = 'verify that you are human';

  fs.writeFileSync(path.join(P.backend, 'config/credentials/development.key'), 'x');
  const r = rejection(human, { apiLocal: true, P, retry });
  assert.match(r.message, /placeholder Rails credentials, so the test@monsterinbox\.com bypass is off$/);
  assert.equal(r.fix, `printf '%s' '<RAILS_MASTER_KEY from Heroku config or a teammate>' > ${root}/backend/config/master.key && rm -rf ${root}/backend/config/credentials`);

  // generic for: remote api, another flash, a real master.key
  assert.equal(rejection(human, { apiLocal: false, P, retry }).fix, retry);
  assert.equal(rejection('Invalid login code', { apiLocal: true, P, retry }).message, 'the login page rejected the email or code (Invalid login code)');
  fs.writeFileSync(path.join(P.backend, 'config/master.key'), 'x');
  assert.equal(rejection(human, { apiLocal: true, P, retry }).fix, retry);
  fs.rmSync(root, { recursive: true, force: true });
});
