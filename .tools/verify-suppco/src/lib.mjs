// Shared layer for every verb. Verbs import from here and nothing else outside their own file.
// Contract: a verb module exports `default async function run(argv, ctx)` and returns an exit code (0/1/2) or throws
// CliError via fail(). stdout is the verb's result; everything else goes to stderr through log()/warn().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------- constants --
export const PORTS = { api: 3000, web: 3001 };
export const LOCAL_WEB_URL = `https://localhost:${PORTS.web}`;
export const LOCAL_API_URL = `http://localhost:${PORTS.api}`;
export const SESSION_COOKIE = '__Secure-authjs.session-token';
export const OAUTH_SCOPE = 'openid profile email offline_access api';
export const BYPASS_SUFFIX = 'test@monsterinbox.com';
export const DEFAULT_ROOT = path.join(os.homedir(), 'work/suppco');

/** Named targets. `local` is filled in from PORTS; `<url>` is anything that parses as http(s). */
export const TARGETS = {
  web: {
    local: { url: LOCAL_WEB_URL },
    staging: { url: 'https://staging.supp.co' },
    prod: { url: 'https://supp.co' },
  },
  api: {
    local: { url: LOCAL_API_URL, oauth: `${LOCAL_API_URL}/`, ws: `ws://localhost:${PORTS.api}/cable` },
    staging: { url: 'https://api-staging.supp.co', oauth: 'https://login-staging.supp.co/', ws: 'wss://api-staging.supp.co/cable' },
    prod: { url: 'https://api.supp.co', oauth: 'https://login.supp.co/', ws: 'wss://api.supp.co/cable' },
  },
};

// ---------------------------------------------------------------- errors --
export class CliError extends Error {
  constructor(code, message, fix) { super(message); this.code = code; this.fix = fix; }
}
/** Throw a CliError. `code` is 1 (check/drive failed) or 2 (usage / missing precondition). `fix` is a shell command. */
export function fail(code, message, fix) { throw new CliError(code, message, fix); }

// ---------------------------------------------------------------- output --
const tty = process.stderr.isTTY;
const c = (n, s) => (tty ? `\x1b[${n}m${s}\x1b[0m` : s);
export const log = (...a) => console.error(c(36, '▸'), ...a);
export const warn = (...a) => console.error(c(33, '⚠'), ...a);
export const out = (...a) => console.log(...a);

// ------------------------------------------------------------ arg parsing --
/**
 * parseArgs(argv, { valued: ['web','api','root'], boolean: ['headed'] }) →
 *   { flags: { web: 'local', headed: true }, rest: ['a','b'], passthrough: [...after --] }
 * Unknown flags → fail(2). `--k=v` and `--k v` both work. Flags given twice: last wins.
 */
export function parseArgs(argv, { valued = [], boolean = [] } = {}) {
  const flags = {}; const rest = []; const passthrough = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { passthrough.push(...argv.slice(i + 1)); break; }
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      if (valued.includes(k)) {
        const v = inline !== undefined ? inline : argv[++i];
        if (v === undefined) fail(2, `--${k} needs a value`, `verify-suppco ${process.argv[2] || ''} --help`);
        flags[k] = v;
      } else if (boolean.includes(k)) {
        flags[k] = true;
      } else {
        fail(2, `unknown flag --${k}`, `verify-suppco ${process.argv[2] || ''} --help`);
      }
    } else rest.push(a);
  }
  return { flags, rest, passthrough };
}

// ----------------------------------------------------------------- paths --
export const expandHome = (p) => path.resolve(String(p).replace(/^~(?=$|\/)/, os.homedir()));
/** Resolve the root holding backend/ and web/. `--root` wins, then $VERIFY_SUPPCO_ROOT, then ~/work/suppco. */
export function resolveRoot(flags = {}) {
  return expandHome(flags.root || process.env.VERIFY_SUPPCO_ROOT || DEFAULT_ROOT);
}
/** State dir: $VERIFY_SUPPCO_STATE, else <root>/.verify-suppco. */
export function paths(root) {
  const state = process.env.VERIFY_SUPPCO_STATE ? expandHome(process.env.VERIFY_SUPPCO_STATE) : path.join(root, '.verify-suppco');
  return {
    root,
    backend: path.join(root, 'backend'),
    web: path.join(root, 'web'),
    webapp: path.join(root, 'web/apps/web'),
    state,
    auth: path.join(state, 'auth'),
    runs: path.join(state, 'runs'),
    logs: path.join(state, 'logs'),
    upState: path.join(state, 'up.json'),   // what `up` started: { web: {pid, pgid, log, url}, api: {...} }
  };
}
export const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });
export const readJson = (p, fallback = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
export const writeJson = (p, v) => { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };

// --------------------------------------------------------------- targets --
/**
 * resolveTarget('web', flags.web) → { kind: 'local'|'staging'|'prod'|'url', name, url, ...TARGETS extras }
 * Accepts a bare http(s) URL as kind 'url'. Unknown word → fail(2).
 */
export function resolveTarget(which, value) {
  const v = value || 'local';
  if (/^https?:\/\//.test(v)) return { kind: 'url', name: v, url: v.replace(/\/+$/, '') };
  const t = TARGETS[which][v];
  if (!t) fail(2, `--${which} must be local|staging|prod|<url>, got '${v}'`, `verify-suppco ${process.argv[2] || ''} --help`);
  return { kind: v, name: v, ...t };
}
/** Both targets from flags. */
export const resolveTargets = (flags) => ({ web: resolveTarget('web', flags.web), api: resolveTarget('api', flags.api) });

// -------------------------------------------------------------- env file --
/** CLI-owned env: $VERIFY_SUPPCO_ENV or <CLI_DIR>/.env (dotenv; every key is documented in <CLI_DIR>/.env.example).
 *  Loaded once at startup into process.env; a variable already in the environment always wins. */
export const ENV_FILE = process.env.VERIFY_SUPPCO_ENV || path.join(CLI_DIR, '.env');
export const ENV_EXAMPLE = path.join(CLI_DIR, '.env.example');
export function loadEnvFile(file = ENV_FILE) {
  const vars = dotenv(file);
  for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined) process.env[k] = v;
  return vars;
}
/** OAuth client secret for an API target: local is fixed, remote targets come from the environment / env file. */
export function oauthSecretFor(apiTarget) {
  if (apiTarget.kind === 'local') return 'development_secret';
  const key = { staging: 'VERIFY_SUPPCO_OAUTH_SECRET_STAGING', prod: 'VERIFY_SUPPCO_OAUTH_SECRET_PROD' }[apiTarget.kind] || 'VERIFY_SUPPCO_OAUTH_SECRET';
  const v = process.env[key];
  if (!v) fail(2, `${key} is not set (needed for --api ${apiTarget.name})`, `echo '${key}=<secret>' >> ${ENV_FILE}`);
  return v;
}

// ----------------------------------------------------------- credentials --
/** Credentials: flag wins over env. Never log the code. */
export function credentials(flags = {}) {
  return { email: flags.email || process.env.VERIFY_SUPPCO_EMAIL || '', code: flags.code || process.env.VERIFY_SUPPCO_CODE || '' };
}
export const isBypassEmail = (email) => typeof email === 'string' && email.endsWith(BYPASS_SUFFIX);

// ------------------------------------------------------------- sessions --
/** .verify-suppco/auth/<email>.json — written by login, read by pw/shot.
 *  Shape: { email, web: <target name>, api: <target name>, savedAt, expiresAt, storageState } */
export const authPath = (P, email) => path.join(P.auth, `${email}.json`);
export function readAuth(P, email) {
  const a = readJson(authPath(P, email));
  if (!a) fail(2, `no session for ${email}`, `verify-suppco login ${email}`);
  return a;
}
export const writeAuth = (P, auth) => writeJson(authPath(P, auth.email), auth);

// ----------------------------------------------------------------- runs --
export const slugify = (s) => String(s).replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'root';
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
/** Create .verify-suppco/runs/<stamp>-<verb>-<slug>/ and return its path. */
export function newRunDir(P, verb, slug) {
  const dir = path.join(P.runs, `${stamp()}-${verb}-${slugify(slug)}`);
  mkdirp(dir);
  return dir;
}

// -------------------------------------------------------------- toolchain --
/** Playwright resolved from the web checkout's node_modules (the shim runs us with its Node via mise). */
export function playwright(P) {
  const candidates = [path.join(P.webapp, 'package.json'), path.join(CLI_DIR, 'package.json')];
  for (const pkg of candidates) {
    if (!fs.existsSync(path.dirname(pkg))) continue;
    try { return createRequire(pkg)('@playwright/test'); } catch { /* next */ }
  }
  fail(2, `Playwright not found in ${P.webapp}/node_modules or ${CLI_DIR}/node_modules`, `cd ${CLI_DIR} && pnpm install && pnpm exec playwright install chromium`);
}
/** Parse a dotenv file into an object (quotes stripped, comments ignored). */
export function dotenv(file) {
  const o = {};
  if (!fs.existsSync(file)) return o;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[m[1]] = v;
  }
  return o;
}
export const webDotenv = (P) => dotenv(path.join(P.webapp, '.env.local'));

/** Every variable the web dev server needs to boot and talk to `apiTarget`. The target keys always override
 *  apps/web/.env.local (Vite keeps process.env over the file); the boot-required keys the app imports statically are
 *  filled with '' only when neither the environment nor .env.local defines them, so a bare clone boots and a configured
 *  one keeps its real values. Secrets never come from the web checkout. */
export const WEB_BOOT_KEYS = [
  'PUBLIC_ACTIVE_TRAFFIC_SPIKE', 'PUBLIC_APPLE_APP_ID', 'PUBLIC_APPS_FLYER_DEV_KEY', 'PUBLIC_ITERABLE_API_KEY',
  'PUBLIC_MIXPANEL_TOKEN', 'PUBLIC_SCANDIT_ANDROID', 'PUBLIC_SCANDIT_IOS', 'PUBLIC_SEGMENT_KEY', 'PUBLIC_SEGMENT_PROXY_URL',
  'PUBLIC_SEGMENT_SERVER_KEY', 'PUBLIC_TERRA_DEV_ID', 'PUBLIC_TRAFFIC_SPIKE_BANNER',
  'PUBLIC_REVENUECAT_ANDROID_API_KEY', 'PUBLIC_REVENUECAT_IOS_API_KEY', 'PUBLIC_REVENUECAT_WEB_API_KEY',
  'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_CLOUD_NAME',
];
export function webEnvFor(apiTarget, P) {
  const file = P ? webDotenv(P) : {};
  const oauth = apiTarget.oauth || `${apiTarget.url}/`;
  const env = {
    PUBLIC_API_URL: `${apiTarget.url}/api`,
    OAUTH_DOMAIN: oauth,
    PUBLIC_OAUTH_DOMAIN: oauth,
    OAUTH_CLIENT_ID: 'web-client',
    PUBLIC_OAUTH_CLIENT_ID: 'web-client',
    OAUTH_SCOPE,
    PUBLIC_OAUTH_SCOPE: OAUTH_SCOPE,
    OAUTH_CLIENT_SECRET: oauthSecretFor(apiTarget),
    PUBLIC_WS_URL: apiTarget.ws || apiTarget.url.replace(/^http/, 'ws') + '/cable',
    AUTH_SECRET: process.env.VERIFY_SUPPCO_AUTH_SECRET || file.AUTH_SECRET || randomBytes(32).toString('hex'),
    AUTH_TRUST_HOST: 'true',
    WEB_PORT: String(PORTS.web),
    BROWSER: 'none',
    HTTPS: 'true',
  };
  for (const k of WEB_BOOT_KEYS) if (process.env[k] === undefined && file[k] === undefined) env[k] = '';
  return env;
}

// ----------------------------------------------------------------- procs --
export function sh(cmd, args, { cwd, env, timeoutMs = 60000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...(env || {}) }, encoding: 'utf8', timeout: timeoutMs });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}
/** Run through mise in a checkout so node/pnpm/ruby are the repo's pins. */
export const mise = (dir, args, opts = {}) => sh('mise', ['exec', '-C', dir, '--', ...args], { cwd: dir, ...opts });
/** Spawn a detached process group with stdout+stderr appended to logFile. Returns the child (pid === pgid). */
export function spawnDetached(cmd, args, { cwd, env, logFile }) {
  mkdirp(path.dirname(logFile));
  const fd = fs.openSync(logFile, 'a');
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) }, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  return child;
}
export const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// ------------------------------------------------------------------ http --
export async function httpStatus(url, { timeoutMs = 10000 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ac.signal, redirect: 'manual' }); return r.status; } catch { return 0; } finally { clearTimeout(t); }
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll fn until it returns truthy. Throws on timeout with `label`. */
export async function waitFor(fn, { timeoutMs = 60000, everyMs = 500, label = 'condition' } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    await sleep(everyMs);
  }
}
export const webHealthy = (url = LOCAL_WEB_URL) => httpStatus(url, { timeoutMs: 5000 }).then((s) => s >= 200 && s < 400);
export const apiHealthy = (url = LOCAL_API_URL) => httpStatus(`${url}/up`, { timeoutMs: 5000 }).then((s) => s === 200);
