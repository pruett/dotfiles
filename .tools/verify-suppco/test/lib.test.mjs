import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CliError, parseArgs, resolveRoot, resolveTarget, resolveTargets, credentials, isBypassEmail, slugify, stamp,
  newRunDir, dotenv, readAuth, writeAuth, paths, webEnvFor, DEFAULT_ROOT, TARGETS, LOCAL_WEB_URL,
  loadEnvFile, oauthSecretFor, WEB_BOOT_KEYS, ENV_FILE,
} from '../src/lib.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-test-'));
const withEnv = (vars, fn) => {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
};
const code2 = (e) => e instanceof CliError && e.code === 2;

test('parseArgs: valued, boolean, --k=v, rest', () => {
  const r = parseArgs(['/x', '--web', 'staging', '--api=prod', '--headed'], { valued: ['web', 'api'], boolean: ['headed'] });
  assert.deepEqual(r.flags, { web: 'staging', api: 'prod', headed: true });
  assert.deepEqual(r.rest, ['/x']);
});
test('parseArgs: -- passthrough keeps flags verbatim', () => {
  const r = parseArgs(['s.mjs', '--headed', '--', '--web', 'x', 'y'], { boolean: ['headed'] });
  assert.deepEqual(r.passthrough, ['--web', 'x', 'y']);
  assert.deepEqual(r.rest, ['s.mjs']);
  assert.equal(r.flags.headed, true);
});
test('parseArgs: --k=v keeps later = signs', () => {
  assert.equal(parseArgs(['--web=https://a/?b=c'], { valued: ['web'] }).flags.web, 'https://a/?b=c');
});
test('parseArgs: unknown flag and missing value → code 2', () => {
  assert.throws(() => parseArgs(['--nope'], {}), code2);
  assert.throws(() => parseArgs(['--web'], { valued: ['web'] }), code2);
});
test('parseArgs: --help / -h', () => {
  assert.equal(parseArgs(['--help']).flags.help, true);
  assert.equal(parseArgs(['-h']).flags.help, true);
});

test('resolveRoot precedence and ~ expansion', () => {
  withEnv({ SUPPCO_ROOT: undefined }, () => assert.equal(resolveRoot({}), path.resolve(DEFAULT_ROOT)));
  withEnv({ SUPPCO_ROOT: '/env/root' }, () => {
    assert.equal(resolveRoot({}), '/env/root');
    assert.equal(resolveRoot({ root: '/flag/root' }), '/flag/root');
  });
  withEnv({ SUPPCO_ROOT: undefined }, () => {
    assert.equal(resolveRoot({ root: '~/foo' }), path.join(os.homedir(), 'foo'));
    assert.equal(resolveRoot({ root: '~' }), os.homedir());
  });
});

test('resolveTarget: named, url, unknown', () => {
  assert.equal(resolveTarget('web').kind, 'local');
  assert.equal(resolveTarget('web', 'local').url, LOCAL_WEB_URL);
  assert.equal(resolveTarget('web', 'staging').url, TARGETS.web.staging.url);
  assert.equal(resolveTarget('api', 'prod').url, TARGETS.api.prod.url);
  const u = resolveTarget('web', 'https://example.com//');
  assert.equal(u.kind, 'url');
  assert.equal(u.url, 'https://example.com');
  assert.throws(() => resolveTarget('web', 'bogus'), code2);
});
test('resolveTargets defaults to local/local', () => {
  const t = resolveTargets({});
  assert.equal(t.web.kind, 'local');
  assert.equal(t.api.kind, 'local');
});

test('credentials: flag wins over env', () => {
  withEnv({ PLAYWRIGHT_EMAIL: 'env@x.com', PLAYWRIGHT_CODE: '111' }, () => {
    assert.deepEqual(credentials({}), { email: 'env@x.com', code: '111' });
    assert.deepEqual(credentials({ email: 'f@x.com', code: '222' }), { email: 'f@x.com', code: '222' });
  });
  withEnv({ PLAYWRIGHT_EMAIL: undefined, PLAYWRIGHT_CODE: undefined }, () => {
    assert.deepEqual(credentials({}), { email: '', code: '' });
  });
});
test('isBypassEmail', () => {
  assert.equal(isBypassEmail('foo+1test@monsterinbox.com'), true);
  assert.equal(isBypassEmail('foo@supp.co'), false);
  assert.equal(isBypassEmail(undefined), false);
});

test('slugify', () => {
  assert.equal(slugify('/home/today'), 'home-today');
  assert.equal(slugify('/'), 'root');
  assert.equal(slugify('a b&c'), 'a-b-c');
  assert.equal(slugify('x.mjs'), 'x.mjs');
});
test('stamp format', () => assert.match(stamp(), /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/));

test('newRunDir creates dir under runs', () => {
  const P = paths(tmp());
  const d = newRunDir(P, 'shot', '/home/today');
  assert.ok(fs.statSync(d).isDirectory());
  assert.equal(path.dirname(d), P.runs);
  assert.match(path.basename(d), /^\d{4}-.*-shot-home-today$/);
});

test('dotenv parsing', () => {
  const f = path.join(tmp(), '.env');
  fs.writeFileSync(f, [
    '# comment', 'A=1', 'export B="two words"', "C='single'", '  D = spaced  ', 'not a line', 'E=', '',
  ].join('\n'));
  assert.deepEqual(dotenv(f), { A: '1', B: 'two words', C: 'single', D: 'spaced', E: '' });
  assert.deepEqual(dotenv(path.join(tmp(), 'missing')), {});
});

test('readAuth missing → code 2 with login fix', () => {
  const P = paths(tmp());
  assert.throws(() => readAuth(P, 'a@b.com'), (e) => code2(e) && e.fix === 'verify-suppco login a@b.com');
});
test('writeAuth/readAuth round trip', () => {
  const P = paths(tmp());
  const a = { email: 'a@b.com', web: 'local', api: 'local', savedAt: 'now', expiresAt: 'later', storageState: { cookies: [] } };
  writeAuth(P, a);
  assert.deepEqual(readAuth(P, 'a@b.com'), a);
});

const webRoot = (envLocal) => {
  const root = tmp(); const P = paths(root);
  fs.mkdirSync(P.webapp, { recursive: true });
  if (envLocal !== undefined) fs.writeFileSync(path.join(P.webapp, '.env.local'), envLocal);
  return P;
};
const CLEAN = { AUTH_SECRET: undefined, OAUTH_CLIENT_SECRET_PROD: undefined, OAUTH_CLIENT_SECRET_STAGING: undefined, OAUTH_CLIENT_SECRET: undefined,
  ...Object.fromEntries(WEB_BOOT_KEYS.map((k) => [k, undefined])) };

test('webEnvFor local vs prod', () => {
  withEnv({ ...CLEAN, OAUTH_CLIENT_SECRET_PROD: 'prod-secret' }, () => {
    const P = webRoot();
    const local = webEnvFor(resolveTarget('api', 'local'), P);
    assert.equal(local.PUBLIC_API_URL, 'http://localhost:3000/api');
    assert.equal(local.OAUTH_CLIENT_SECRET, 'development_secret');
    assert.equal(local.PUBLIC_WS_URL, 'ws://localhost:3000/cable');
    const prod = webEnvFor(resolveTarget('api', 'prod'), P);
    assert.equal(prod.PUBLIC_API_URL, 'https://api.supp.co/api');
    assert.equal(prod.OAUTH_DOMAIN, 'https://login.supp.co/');
    assert.equal(prod.OAUTH_CLIENT_SECRET, 'prod-secret');
  });
});

test('loadEnvFile: loads, does not override, missing file is a no-op', () => {
  const f = path.join(tmp(), 'env');
  fs.writeFileSync(f, 'VSC_TEST_NEW=from-file\nVSC_TEST_SET=from-file\n');
  withEnv({ VSC_TEST_NEW: undefined, VSC_TEST_SET: 'from-env' }, () => {
    const vars = loadEnvFile(f);
    assert.equal(process.env.VSC_TEST_NEW, 'from-file');
    assert.equal(process.env.VSC_TEST_SET, 'from-env');
    assert.equal(vars.VSC_TEST_SET, 'from-file');
    assert.deepEqual(loadEnvFile(path.join(tmp(), 'nope')), {});
  });
  delete process.env.VSC_TEST_NEW;
});

test('oauthSecretFor: local fixed, remote from env, missing → code 2 with fix', () => {
  withEnv({ ...CLEAN, OAUTH_CLIENT_SECRET: 'url-secret' }, () => {
    assert.equal(oauthSecretFor(resolveTarget('api', 'local')), 'development_secret');
    assert.equal(oauthSecretFor(resolveTarget('api', 'https://api.example.com')), 'url-secret');
    assert.throws(() => oauthSecretFor(resolveTarget('api', 'staging')),
      (e) => code2(e) && e.fix.includes('OAUTH_CLIENT_SECRET_STAGING') && e.fix.includes(ENV_FILE));
  });
});

test('WEB_BOOT_KEYS fillers: "" when absent, omitted when env or .env.local defines them', () => {
  const [a, b, c] = WEB_BOOT_KEYS;
  const api = resolveTarget('api', 'local');
  withEnv({ ...CLEAN }, () => {
    const env = webEnvFor(api, webRoot());
    for (const k of WEB_BOOT_KEYS) assert.equal(env[k], '');
  });
  withEnv({ ...CLEAN, [a]: 'x' }, () => {
    const env = webEnvFor(api, webRoot(`${b}=y\n`));
    assert.ok(!(a in env), 'process.env defines it');
    assert.ok(!(b in env), '.env.local defines it');
    assert.equal(env[c], '');
  });
});

test('AUTH_SECRET precedence: env > .env.local > random 64-hex', () => {
  const api = resolveTarget('api', 'local');
  withEnv({ ...CLEAN, AUTH_SECRET: 'from-env' }, () =>
    assert.equal(webEnvFor(api, webRoot('AUTH_SECRET=from-file\n')).AUTH_SECRET, 'from-env'));
  withEnv({ ...CLEAN }, () => {
    assert.equal(webEnvFor(api, webRoot('AUTH_SECRET=from-file\n')).AUTH_SECRET, 'from-file');
    const r1 = webEnvFor(api, webRoot()).AUTH_SECRET;
    const r2 = webEnvFor(api, webRoot()).AUTH_SECRET;
    assert.match(r1, /^[0-9a-f]{64}$/);
    assert.notEqual(r1, r2);
  });
});
