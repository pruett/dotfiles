#!/usr/bin/env node
// verify-suppco — deterministic CLI that boots and drives the SuppCo app (Rails backend + SvelteKit web) and its iOS shell.
// Run through bin/verify-suppco (mise shim). State, logs, auth and screenshots live in <suppco>/.verify-suppco/.
//
// Verbs: doctor · up · dev · code · down · status · logs · jobs · login · api · shot · open · pw · trace · rails · sql · db · throttle · env · ios
// `verify-suppco help` prints the full reference. Every verb exits 0 on success, 1 on failure, 2 on usage error.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- paths -----
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The skill lives in dotfiles; the checkouts live under $SUPPCO_ROOT (default ~/work/suppco): <root>/backend, <root>/web, <root>/.verify-suppco.
const ROOT = path.resolve(process.env.SUPPCO_ROOT || path.join(os.homedir(), 'work/suppco'));
const BACKEND = path.join(ROOT, 'backend');
const WEB = path.join(ROOT, 'web');
const WEBAPP = path.join(WEB, 'apps/web');
const STATE = path.join(ROOT, '.verify-suppco');
const P = {
  state: path.join(STATE, 'state.json'),
  logs: path.join(STATE, 'logs'),
  auth: path.join(STATE, 'auth'),
  shots: path.join(STATE, 'shots'),
  tmp: path.join(STATE, 'tmp'),
  env: path.join(STATE, 'env'),
  traces: path.join(STATE, 'traces'),
  browser: path.join(STATE, 'browser'),
};
for (const d of Object.values(P)) if (!d.endsWith('.json')) fs.mkdirSync(d, { recursive: true });
const USER_CWD = process.env.VERIFY_CWD || process.cwd();
const userPath = (p) => (path.isAbsolute(p) ? p : path.resolve(USER_CWD, p));

// ------------------------------------------------------------ constants -----
const DB_ALIASES = { dev: 'api_development', prod: 'api_prod_mirror', staging: 'api_staging_mirror' };
// Local mirrors of remote databases, filled by `verify-suppco db pull`. prod: the backend's rake task fetches the scoped `dev`
// credential (BROWN follower) itself. staging: no scoped role exists, so verify-suppco hands the task the app's DATABASE_URL as
// WHITELIST_SOURCE_URL (the owner role can read every table, so any table name is pullable).
const MIRRORS = {
  [DB_ALIASES.prod]: { label: 'production', app: 'suppleco-production', sourceUrl: null },
  [DB_ALIASES.staging]: { label: 'staging', app: 'suppleco-staging', sourceUrl: (app) => herokuConfigGet(app, 'DATABASE_URL') },
};
// Ports are fixed: the seeded OAuth redirect URIs, capacitor.config.ts and the Cloudflare routes all pin :3000/:3001.
const PORTS = { backend: 3000, web: 3001 };
const DEFAULTS = { api: 'prod', db: DB_ALIASES.dev, tunnel: process.env.SUPP_DEV_TUNNEL || '', apiTunnel: '' };
const OAUTH_SCOPE = 'openid profile email offline_access api';
const SESSION_COOKIE = '__Secure-authjs.session-token';
// The iOS app is a Capacitor shell that loads the web app remotely; capacitor.config.ts's TARGET picks the origin
// (dev → https://$SUPP_DEV_TUNNEL) and the Xcode scheme. Scheme names: ios/App/App.xcodeproj/xcshareddata/xcschemes.
const IOS = { schemes: { dev: 'App Dev', staging: 'App Staging', prod: 'App' }, xcode: '/Applications/Xcode.app/Contents/Developer' };
const TARGETS = {
  staging: { apiBase: 'https://api-staging.supp.co', oauth: 'https://login-staging.supp.co/', ws: 'wss://api-staging.supp.co/cable' },
  prod: { apiBase: 'https://api.supp.co', oauth: 'https://login.supp.co/', ws: 'wss://api.supp.co/cable' },
};
const REDACT = /(SECRET|KEY|TOKEN|PASSWORD)/i;
const WEB_URL = `https://localhost:${PORTS.web}`;
const BACKEND_URL = `http://localhost:${PORTS.backend}`;

// -------------------------------------------------------------- output -----
const isTTY = process.stderr.isTTY;
const c = (code, s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const log = (...a) => console.error(c(36, '▸'), ...a);
const warn = (...a) => console.error(c(33, '⚠'), ...a);
const ok = (...a) => console.error(c(32, '✔'), ...a);
const fail = (msg, code = 1) => {
  console.error(c(31, '✖'), msg);
  process.exit(code);
};
const out = (s) => process.stdout.write(typeof s === 'string' ? s : JSON.stringify(s, null, 2) + '\n');

// --------------------------------------------------------------- shell -----
function sh(cmd, args, { cwd, env, input, inherit = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    if (input != null && child.stdin) child.stdin.end(input);
    child.on('error', (e) => resolve({ code: 127, stdout, stderr: stderr + e.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
const mise = (dir, args, opts = {}) => sh('mise', ['exec', '-C', dir, '--', ...args], opts);
const has = (bin) => (process.env.PATH || '').split(path.delimiter).some((d) => { try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; } });
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const slugify = (s, fallback = 'root') => s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || fallback;
const fileHash = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);

/** Who listens on <port>: [{ pid, pgid }] in one lsof call. */
function listeners(port) {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpg'], { encoding: 'utf8' });
  const found = []; let cur = null;
  for (const line of (r.stdout || '').split('\n')) {
    if (line[0] === 'p') { cur = { pid: Number(line.slice(1)) }; found.push(cur); }
    else if (line[0] === 'g' && cur) cur.pgid = Number(line.slice(1));
  }
  return found;
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const groupAlive = (pgid) => alive(-pgid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeoutMs, everyMs = 1000, label }) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(everyMs);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${label}`);
}

function httpStatus(url, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}
const backendHealthy = async (timeoutMs) => (await httpStatus(`${BACKEND_URL}/up`, { timeoutMs })) === 200;
const webHealthy = async (timeoutMs) => (await httpStatus(`${WEB_URL}/`, { timeoutMs })) === 200;
const mkcertTrusted = () => spawnSync('security', ['find-certificate', '-c', 'mkcert', '/Library/Keychains/System.keychain'], { stdio: 'ignore' }).status === 0;
function xcodeDevDir() {
  const dir = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout?.trim() || '';
  return { dir, ok: /Xcode\.app\/Contents\/Developer$/.test(dir), fix: `sudo xcode-select -s ${IOS.xcode} && sudo xcodebuild -license accept` };
}
/** Heroku CLI state: 'missing' | 'logged-out' | the logged-in account. */
function herokuUser() {
  if (!has('heroku')) return 'missing';
  const r = spawnSync('heroku', ['auth:whoami'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'logged-out';
}
/** One config var of a Heroku app, or fail with the access hint. */
function herokuConfigGet(app, key) {
  const r = spawnSync('heroku', ['config:get', key, '-a', app], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) fail(`could not read ${key} from ${app}:\n${r.stderr.trim()}\nYou need at least Operate access to ${app} in the Heroku dashboard.`);
  return r.stdout.trim();
}

// ---------------------------------------------------------------- env ------
function parseDotenv(file) {
  if (!fs.existsSync(file)) return {};
  const o = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    o[m[1]] = v;
  }
  return o;
}
const webDotenv = () => ({ ...parseDotenv(path.join(WEBAPP, '.env')), ...parseDotenv(path.join(WEBAPP, '.env.local')) });
const overlay = (name) => parseDotenv(path.join(P.env, `${name}.env`));

function target(cfg) {
  if (cfg.api === 'local') {
    const base = cfg.apiTunnel ? `https://${cfg.apiTunnel}` : BACKEND_URL;
    return { apiBase: base, oauth: `${base}/`, ws: `${base.replace(/^http/, 'ws')}/cable`, secret: 'development_secret' };
  }
  const t = TARGETS[cfg.api];
  if (!t) fail(`unknown --api '${cfg.api}' (local|staging|prod)`, 2);
  const ov = overlay(cfg.api);
  const secret = ov.OAUTH_CLIENT_SECRET || webDotenv().OAUTH_CLIENT_SECRET || '';
  return { ...t, secret, overlay: ov };
}

function webEnv(cfg) {
  const t = target(cfg);
  return {
    ...(t.overlay || {}),
    PUBLIC_API_URL: `${t.apiBase}/api`,
    OAUTH_DOMAIN: t.oauth,
    PUBLIC_OAUTH_DOMAIN: t.oauth,
    OAUTH_CLIENT_ID: 'web-client',
    PUBLIC_OAUTH_CLIENT_ID: 'web-client',
    OAUTH_SCOPE,
    PUBLIC_OAUTH_SCOPE: OAUTH_SCOPE,
    OAUTH_CLIENT_SECRET: t.secret,
    PUBLIC_WS_URL: t.ws,
    WEB_PORT: String(PORTS.web),
    BROWSER: 'none',
    HTTPS: 'true',
    SUPP_DEV_TUNNEL: cfg.tunnel || '',
  };
}
function backendEnv(cfg) {
  return {
    ...overlay('backend'),
    DEV_DATABASE: cfg.db,
    RAILS_ENV: 'development',
    // The backend's own defaults are localhost:3000; only a real tunnel changes the OAuth issuer and allowed hosts.
    ...(cfg.apiTunnel ? { SUPP_API_TUNNEL: cfg.apiTunnel, RAILS_DEVELOPMENT_HOSTS: cfg.apiTunnel } : {}),
  };
}
/** Checkout directories in use for this config (defaults are the main clones). */
const dirs = (cfg) => {
  const backend = cfg.backendDir || BACKEND;
  const web = cfg.webDir || WEB;
  return { backend, web, webapp: path.join(web, 'apps/web') };
};

const git = (dir, args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
function gitInfo(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const sha = git(dir, ['rev-parse', '--short', 'HEAD']).stdout.trim();
  const dirty = git(dir, ['diff', '--quiet']).status !== 0;
  return { branch, sha, dirty };
}
const gitLabel = (dir) => { const g = gitInfo(dir); return g ? ` @ ${g.branch} ${g.sha}${g.dirty ? '*' : ''}` : ''; };
function worktrees(repo) {
  const out = git(repo, ['worktree', 'list', '--porcelain']).stdout;
  const list = []; let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; list.push(cur); }
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
  }
  return list;
}

// Untracked files a fresh worktree needs to boot, copied from the main clone.
const ESSENTIALS = {
  backend: ['mise.local.toml', '.env', 'config/master.key', 'config/credentials/development.key', 'config/credentials/development.yml.enc', 'config/credentials/test.key', 'config/credentials/test.yml.enc'],
  web: ['mise.local.toml', 'apps/web/.env.local'],
};

/** The file that marks a directory as a bootable checkout of <kind>. */
const REPO_MARKER = { backend: 'Gemfile', web: 'apps/web/package.json' };
/** The checkouts <cfg> boots, with whether each still exists and the flag that points back at the main clone. */
function checkouts(cfg) {
  const d = dirs(cfg);
  return ['backend', 'web'].map((role) => {
    const dir = d[role];
    const exists = fs.existsSync(path.join(dir, REPO_MARKER[role]));
    return { role, dir, exists, main: dir === (role === 'backend' ? BACKEND : WEB), fix: `verify-suppco up --${role} ${role}` };
  });
}
/** Refuse a config whose remembered --backend/--web checkout is gone (a deleted worktree) before anything boots from it. */
function assertCheckouts(cfg) {
  const gone = checkouts(cfg).filter((x) => !x.exists);
  if (!gone.length) return;
  fail(gone.map((x) => `${x.role} checkout ${path.relative(ROOT, x.dir)} no longer exists (state.json remembers the last --${x.role}).\n  fix: ${x.fix}   (main clone) or --${x.role} <branch|dir>`).join('\n'), 2);
}

/** `--backend <x>` / `--web <x>`: the main clone (`backend`, `web` or `main`), a directory, or a branch (worktree created under .verify-suppco/worktrees on demand). */
async function resolveRepo(kind, spec) {
  const main = kind === 'backend' ? BACKEND : WEB;
  if (!spec || spec === kind || spec === 'main') return main;
  // A directory: relative to where you ran verify-suppco, else relative to $SUPPCO_ROOT (so `--web web` works from anywhere).
  const asDir = [userPath(spec), path.join(ROOT, spec)].find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
  if (asDir) {
    const marker = REPO_MARKER[kind];
    if (!fs.existsSync(path.join(asDir, marker))) fail(`${asDir} is not a ${kind} checkout (no ${marker})`, 2);
    return path.resolve(asDir);
  }
  const branch = spec;
  const mainInfo = gitInfo(main);
  if (mainInfo && mainInfo.branch === branch) return main;
  const existing = worktrees(main).find((w) => w.branch === branch);
  if (existing) return existing.path;
  const dest = path.join(STATE, 'worktrees', kind, slugify(branch));
  const hasLocal = git(main, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;
  if (!hasLocal) {
    log(`fetching origin/${branch}`);
    const f = git(main, ['fetch', 'origin', branch]);
    if (f.status !== 0) fail(`no local branch '${branch}' and fetch failed:\n${f.stderr.trim()}\n(pass a directory instead, or create the branch first)`);
  }
  log(`creating ${kind} worktree for ${branch} at ${path.relative(ROOT, dest)}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const add = hasLocal ? git(main, ['worktree', 'add', dest, branch]) : git(main, ['worktree', 'add', '--track', '-b', branch, dest, `origin/${branch}`]);
  if (add.status !== 0) fail(`git worktree add failed:\n${add.stderr.trim()}`);
  return dest;
}

/** Make a checkout bootable: copy untracked essentials, trust mise config, install deps when the lockfile changed. */
async function prepareRepo(kind, dir) {
  const main = kind === 'backend' ? BACKEND : WEB;
  // The main clone already has its untracked essentials and trusted mise config; it still gets the dependency check below
  // (its node_modules can rot too, e.g. pnpm symlinks left pointing into a worktree that was deleted).
  if (path.resolve(dir) !== path.resolve(main)) {
    for (const rel of ESSENTIALS[kind]) {
      const src = path.join(main, rel), dst = path.join(dir, rel);
      if (fs.existsSync(src) && !fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    }
    spawnSync('mise', ['trust', '--quiet', dir], { stdio: 'ignore' });
    spawnSync('mise', ['trust', '--quiet', path.join(dir, 'mise.local.toml')], { stdio: 'ignore' });
  }
  const deps = readState().deps || {};
  // Each repo has one or two lockfiles (backend: Gemfile.lock + pnpm-lock.yaml for Vite Ruby; web: pnpm-lock.yaml).
  const pnpm = ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'];
  const steps = kind === 'backend'
    ? [
        { lock: 'Gemfile.lock', installed: async () => (await mise(dir, ['bundle', 'check'])).code === 0, cmd: ['bundle', 'install', '--quiet'] },
        // Probe a package's package.json, not .bin/: pnpm's .bin shims are plain files that survive when the packages they
        // point at (symlinks into another checkout's node_modules/.pnpm) are gone.
        { lock: 'pnpm-lock.yaml', installed: async () => fs.existsSync(path.join(dir, 'node_modules/vite/package.json')), cmd: pnpm },
      ]
    : [{ lock: 'pnpm-lock.yaml', installed: async () => fs.existsSync(path.join(dir, 'apps/web/node_modules/vite/package.json')), cmd: pnpm }];
  for (const st of steps) {
    const lock = path.join(dir, st.lock);
    if (!fs.existsSync(lock)) continue;
    const hash = fileHash(lock);
    const key = `${dir}:${st.lock}`;
    if (deps[key] === hash && (await st.installed())) continue;
    log(`installing ${kind} dependencies (${st.cmd[0]}) in ${path.relative(ROOT, dir)} — ${st.lock} changed or first use`);
    // CI=true keeps pnpm non-interactive: relinking a modules dir whose virtual store moved otherwise prompts, and aborts without a TTY.
    const r = await mise(dir, st.cmd, { inherit: true, env: st.cmd[0] === 'pnpm' ? { CI: 'true' } : {} });
    if (r.code !== 0) fail(`${st.cmd.join(' ')} failed in ${dir}`);
    updateState((s) => { (s.deps ??= {})[key] = hash; });
  }
}

// --------------------------------------------------------------- state -----
function readState() {
  try { return JSON.parse(fs.readFileSync(P.state, 'utf8')); } catch { return {}; }
}
function writeState(s) { fs.writeFileSync(P.state, JSON.stringify(s, null, 2) + '\n'); }
/** Read-modify-write state.json in one step so concurrent writers never clobber each other's fields. */
function updateState(fn) { const s = readState(); fn(s); writeState(s); return s; }
function currentConfig(overrides = {}) {
  const s = readState();
  const cfg = { ...DEFAULTS, ...(s.config || {}), ...overrides };
  if (DB_ALIASES[cfg.db]) cfg.db = DB_ALIASES[cfg.db];
  if (cfg.backendDir === BACKEND) delete cfg.backendDir;
  if (cfg.webDir === WEB) delete cfg.webDir;
  return cfg;
}

// Every process verify-suppco spawns carries these env markers, so its processes can be found even if state.json is lost.
const MARK_ROLE = 'VERIFY_ROLE', MARK_ROOT = 'VERIFY_ROOT';
/** Every live process verify-suppco started, for one role or all: [{ role, pid, pgid }] — one `ps` sweep. */
function ownProcesses(role) {
  const r = spawnSync('ps', ['-axo', 'pid=,pgid=,command=', '-E'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const found = [];
  for (const line of (r.stdout || '').split('\n')) {
    if (!line.includes(`${MARK_ROOT}=${ROOT}`)) continue;
    const m = line.trim().match(/^(\d+)\s+(\d+)/);
    const rm = line.match(new RegExp(`${MARK_ROLE}=(\\w+)`));
    if (!m || !rm || Number(m[1]) === process.pid || (role && rm[1] !== role)) continue;
    found.push({ role: rm[1], pid: Number(m[1]), pgid: Number(m[2]) });
  }
  return found;
}

/** Who owns a role's port: 'managed' (verify-suppco's process group), 'foreign', or 'down'. */
function inspect(role, record) {
  const ls = listeners(PORTS[role]);
  if (!ls.length) return { state: 'down', pids: [] };
  const pids = ls.map((l) => l.pid);
  const pgids = [...new Set(ls.map((l) => l.pgid).filter(Boolean))];
  if (record && pgids.length && pgids.every((g) => g === record.pgid)) return { state: 'managed', pids, pgid: record.pgid };
  // state.json lost or stale: the env markers still say verify-suppco started it — repair the record.
  if (pgids.length === 1 && ownProcesses(role).some((p) => p.pgid === pgids[0])) {
    updateState((s) => { s[role] = { ...(s[role] || {}), pid: pgids[0], pgid: pgids[0], log: path.join(P.logs, `${role}.log`) }; });
    return { state: 'managed', pids, pgid: pgids[0] };
  }
  return { state: 'foreign', pids, pgids };
}

async function killGroup(pgid, port, label) {
  log(`stopping ${label} (pgid ${pgid})`);
  try { process.kill(-pgid, 'SIGTERM'); } catch { /* already gone */ }
  const gone = async () => !groupAlive(pgid) && (!port || listeners(port).length === 0);
  try {
    await waitFor(gone, { timeoutMs: 20000, everyMs: 500, label: `${label} to exit` });
  } catch {
    warn(`${label} ignored SIGTERM; sending SIGKILL`);
    try { process.kill(-pgid, 'SIGKILL'); } catch { /* gone */ }
    await sleep(1000);
  }
  if (port) for (const l of listeners(port)) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } }
}

/** Kill every instance of <role> verify-suppco ever started (state record + env-marker sweep), except one pgid. Returns how many. */
async function reapRole(role, { except } = {}) {
  const s = readState();
  const pgids = new Set(ownProcesses(role).map((p) => p.pgid));
  if (s[role]?.pgid) pgids.add(s[role].pgid);
  if (except) pgids.delete(except);
  let killed = 0;
  for (const g of pgids) if (groupAlive(g)) { await killGroup(g, null, `previous ${role} instance`); killed++; }
  for (const p of ownProcesses(role)) if (p.pgid !== except) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
  if (s[role] && s[role].pgid !== except) updateState((st) => { delete st[role]; });
  return killed;
}

function detach(label, cmd, args, { cwd, env } = {}) {
  const logFile = path.join(P.logs, `${label}.log`);
  const fd = fs.openSync(logFile, 'a');
  fs.writeSync(fd, `\n===== verify-suppco: ${new Date().toISOString()} ${cmd} ${args.join(' ')}\n`);
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  return { pid: child.pid, pgid: child.pid, startedAt: new Date().toISOString(), log: logFile };
}
/** Spawn a server with the role markers so it can always be found again. */
const spawnServer = (role, cmd, args, opts) => detach(role, cmd, args, { ...opts, env: { ...opts.env, [MARK_ROLE]: role, [MARK_ROOT]: ROOT } });
/** Re-invoke verify-suppco itself in the background (headed browsers that must outlive this process). */
const spawnDetachedSelf = (args, label) => detach(label, process.execPath, [fileURLToPath(import.meta.url), ...args], { env: { VERIFY_CWD: USER_CWD } }).pid;

/** Last <n> lines of a log without reading the whole (never-rotated) file. */
function tailLog(file, n = 40) {
  try {
    const size = fs.statSync(file).size, len = Math.min(size, 64 * 1024);
    const buf = Buffer.alloc(len); const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
    return buf.toString('utf8').split('\n').slice(-n).join('\n');
  } catch { return ''; }
}

// ------------------------------------------------------------ database -----
/** Scalar/column query without a transaction wrapper; returns trimmed stdout lines. */
function psqlLines(db, sql) {
  const r = spawnSync('psql', ['-XtAc', sql, ...(db ? ['-d', db] : [])], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean) : null;
}
const dbExists = (name) => psqlLines(null, `select 1 from pg_database where datname='${name}'`)?.[0] === '1';
function psql(db, args, opts = {}) {
  return sh('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], opts);
}
const rails = (cfg, args, opts = {}) => mise(dirs(cfg).backend, ['bin/rails', ...args], { ...opts, env: { ...backendEnv(cfg), ...(opts.env || {}) } });

async function railsRunner(cfg, rubySource, env = {}, opts = {}) {
  const file = path.join(P.tmp, `runner-${process.pid}-${Date.now()}.rb`);
  fs.writeFileSync(file, rubySource);
  try { return await rails(cfg, ['runner', '-e', 'development', file], { ...opts, env }); } finally { fs.rmSync(file, { force: true }); }
}
/** Run a ruby snippet that sets `payload`; returns it parsed, or fails with <what> and the output tail. */
async function railsJson(cfg, rubySource, env, what) {
  const r = await railsRunner(cfg, `${rubySource}\nputs "VERIFY_JSON_BEGIN\\n#{payload.to_json}\\nVERIFY_JSON_END"`, env);
  const m = r.stdout.match(/VERIFY_JSON_BEGIN\n([\s\S]*?)\nVERIFY_JSON_END/);
  try { if (m) return JSON.parse(m[1]); } catch { /* fall through */ }
  fail(`${what} failed:\n${(r.stderr + r.stdout).slice(-2500)}`);
}
async function setDbEnvironment(cfg, db) {
  const r = await rails({ ...cfg, db }, ['db:environment:set', 'RAILS_ENV=development']);
  if (r.code !== 0) warn(`db:environment:set failed (non-fatal):\n${r.stderr.slice(-500)}`);
}
/** Migration versions present in db/migrate but not in schema_migrations — without booting Rails. */
function pendingMigrations(cfg) {
  const dir = path.join(dirs(cfg).backend, 'db/migrate');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.match(/^(\d{14})_/)?.[1]).filter(Boolean) : [];
  const applied = new Set(psqlLines(cfg.db, 'select version from schema_migrations') || []);
  return files.filter((v) => !applied.has(v)).sort();
}

const ESSENTIALS_RB = `
# Mirrors bin/pull_production#seed_essentials: the OAuth clients the apps log in through + a few staff users.
def app!(uid, name, redirect)
  a = Doorkeeper::Application.find_or_initialize_by(uid: uid)
  a.name = name; a.secret = 'development_secret'; a.redirect_uri = redirect
  a.scopes = 'api openid profile email offline_access'; a.confidential = false; a.trusted = true
  a.save!
end
app!('admin', 'SuppCo Admin', "http://localhost:3000/admin/oauth/callback\\nhttps://*.supp.co/admin/oauth/callback")
app!('cms', 'SuppCo CMS', "http://localhost:3000/cms/oauth/callback\\nhttps://*.supp.co/cms/oauth/callback")
app!('web-client', 'SuppCo Client', "https://localhost:3001/auth/callback/web-client\\nhttps://localhost:3002/auth/callback/web-client\\nhttps://localhost:3003/auth/callback/web-client\\nhttps://*.supp.co/auth/callback/web-client\\nhttps://supp.co/auth/callback/web-client")
{ 'brandon@supp.co' => ['Brandon Keene', UserRole::ADMIN], 'editor@supp.co' => ['SuppCo', UserRole::EDITOR],
  'test@supp.co' => ['Test User', UserRole::CUSTOMER] }.each do |email, (name, role)|
  User.find_or_create_by!(email: email) { |u| u.name = name; u.role = role }
end
payload = { applications: Doorkeeper::Application.count, users: User.count, database: ActiveRecord::Base.connection_db_config.database }
`;

async function dbInit(cfg, { quiet = false } = {}) {
  const name = cfg.db;
  if (!dbExists(name)) {
    log(`creating database ${name} and loading db/structure.sql`);
    let r = await sh('createdb', [name]);
    if (r.code !== 0) fail(`createdb ${name} failed:\n${r.stderr}`);
    r = await psql(name, ['-q', '-f', path.join(dirs(cfg).backend, 'db/structure.sql')]);
    if (r.code !== 0) fail(`loading structure.sql into ${name} failed:\n${r.stderr.slice(-2000)}`);
    await setDbEnvironment(cfg, name);
  } else if (!quiet) log(`database ${name} exists`);
  const j = await railsJson(cfg, ESSENTIALS_RB, {}, `seeding essentials into ${name}`);
  ok(`${name}: ${j.applications} OAuth applications, ${j.users} users`);
  return j;
}

async function dbPull(cfg, tables) {
  const mirror = MIRRORS[cfg.db] || MIRRORS[DB_ALIASES.prod];
  const hk = herokuUser();
  if (hk === 'missing') fail(`heroku CLI missing. Fix: brew tap heroku/brew && brew install heroku && heroku login   (needs access to ${mirror.app})`);
  if (hk === 'logged-out') fail('heroku CLI is not logged in. Fix: heroku login');
  const env = mirror.sourceUrl ? { WHITELIST_SOURCE_URL: mirror.sourceUrl(mirror.app) } : {};
  await dbInit(cfg, { quiet: true });
  const task = tables.length ? `db:pull_tables[${tables.join(',')}]` : 'db:pull_tables';
  log(`pulling ${mirror.label} whitelisted tables into ${cfg.db} (${tables.length ? tables.join(', ') : 'default set'})`);
  // WhitelistedTablePull asks the operator to type the env name; we answer on stdin (target is guarded to development).
  const r = await rails(cfg, [task], { input: 'development\n', env });
  process.stdout.write(r.stdout);
  if (r.code !== 0) fail(`db:pull_tables failed:\n${r.stderr.slice(-3000)}`);
  // TRUNCATE ... CASCADE can clear tables the essentials depend on; re-assert them.
  await railsJson(cfg, ESSENTIALS_RB, {}, 're-seeding essentials');
  updateState((s) => { s.pulls = { ...(s.pulls || {}), [cfg.db]: { at: new Date().toISOString(), tables: tables.length ? tables : 'default' } }; });
  ok(`pull complete into ${cfg.db}`);
}

// ---------------------------------------------------------------- auth -----
const authFile = (email) => path.join(P.auth, `${email.toLowerCase()}.json`);
const readAuth = (email) => { try { return JSON.parse(fs.readFileSync(authFile(email), 'utf8')); } catch { return null; } };
const writeAuth = (auth) => fs.writeFileSync(authFile(auth.email), JSON.stringify(auth, null, 2));
const fresh = (a, skewSec = 300) => a && a.expiresAt && a.expiresAt - skewSec > Date.now() / 1000;

let _authjs;
async function authjs() {
  return (_authjs ??= await import(pathToFileURL(path.join(WEBAPP, 'node_modules/@auth/core/jwt.js')).href));
}
function authSecret() {
  const s = process.env.AUTH_SECRET || webDotenv().AUTH_SECRET;
  if (!s) fail(`AUTH_SECRET not found in ${path.relative(ROOT, WEBAPP)}/.env.local — the web app cannot boot without it either`);
  return s;
}

/** Build the Auth.js session cookie exactly as auth.ts's jwt callback would after a real login. */
async function sessionCookie({ user, accessToken, refreshToken, expiresAt }) {
  const { encode } = await authjs();
  const profile = {
    id: user.id, email: user.email, name: user.name || '', picture: user.picture || undefined,
    updated_at: Date.now(), username: user.slug,
    isPreviewUser: user.role === 'admin' || /@supp\.co$/i.test(user.email),
    isExpert: !!user.is_expert, isBetaTester: !!user.is_beta_tester, isVerified: !!user.is_verified,
  };
  const value = await encode({
    token: { sub: user.id, email: user.email, name: user.name || '', picture: user.picture || undefined, accessToken, refreshToken, expiresAt, profile },
    secret: authSecret(), salt: SESSION_COOKIE, maxAge: 30 * 24 * 3600,
  });
  return { name: SESSION_COOKIE, value, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 };
}

const MINT_RB = `
require 'json'
email = ENV.fetch('VERIFY_EMAIL').downcase.strip
role  = ENV['VERIFY_ROLE'].to_s.strip
u = User.find_by(email: email)
created = u.nil?
u ||= User.create!(email: email)
u.update!(role: role) if role.present? && u.role != role
app = Doorkeeper::Application.find_by(uid: 'web-client')
abort("web-client OAuth application missing in #{ActiveRecord::Base.connection_db_config.database} — run: verify-suppco db init") if app.nil?
t = Doorkeeper::AccessToken.create!(application: app, resource_owner_id: u.id, scopes: 'api openid profile email offline_access',
                                    expires_in: 24.hours.to_i, use_refresh_token: true)
payload = {
  created: created, accessToken: t.token, refreshToken: t.refresh_token, expiresAt: t.created_at.to_i + t.expires_in,
  user: { id: u.id, email: u.email, name: u.name, slug: u.slug, role: u.role, picture: (u.respond_to?(:avatar_url) ? u.avatar_url : nil),
          is_expert: u.is_expert?, is_beta_tester: u.beta_tester?, is_verified: u.is_verified? },
  database: ActiveRecord::Base.connection_db_config.database
}
`;

async function mintLogin(cfg, email, role) {
  const j = await railsJson(cfg, MINT_RB, { VERIFY_EMAIL: email, ...(role ? { VERIFY_ROLE: role } : {}) }, `minting a token for ${email}`);
  const cookie = await sessionCookie(j);
  const auth = {
    email: j.user.email, api: cfg.api, db: j.database, mode: 'minted', mintedAt: new Date().toISOString(),
    user: j.user, accessToken: j.accessToken, refreshToken: j.refreshToken, expiresAt: j.expiresAt,
    storageState: { cookies: [cookie], origins: [] },
  };
  writeAuth(auth);
  if (j.created) warn(`user ${email} did not exist in ${j.database}; created (role ${j.user.role})`);
  return auth;
}

/** Refresh a remote (staging/prod) session via the public-client refresh grant and re-encode the cookie. */
async function refreshRemote(cfg, auth) {
  const t = target(cfg);
  const res = await fetch(`${t.oauth}oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: 'web-client', refresh_token: auth.refreshToken }),
  });
  if (!res.ok) return null;
  const tok = await res.json();
  auth.accessToken = tok.access_token; auth.refreshToken = tok.refresh_token || auth.refreshToken;
  auth.expiresAt = Math.floor(Date.now() / 1000 + tok.expires_in);
  auth.storageState = { cookies: [await sessionCookie(auth)], origins: [] };
  writeAuth(auth);
  return auth;
}

/** Resolve a usable identity: cached & fresh → as is; stale local → re-mint; stale remote → refresh or demand a login. */
async function identity(cfg, email, { role } = {}) {
  let a = readAuth(email);
  if (a && a.api === cfg.api && (cfg.api !== 'local' || a.db === cfg.db) && fresh(a)) return a;
  if (cfg.api === 'local') {
    log(a ? `session for ${email} is stale or for another target; re-minting` : `no session for ${email}; minting`);
    return mintLogin(cfg, email, role);
  }
  if (a && a.api === cfg.api && a.refreshToken) {
    const r = await refreshRemote(cfg, a);
    if (r) return r;
  }
  fail(`no usable ${cfg.api} session for ${email}. Run: verify-suppco login ${email}   (opens a browser; you complete the real login once)`);
}

// ------------------------------------------------------------ playwright ----
function playwright() {
  const require = createRequire(path.join(WEBAPP, 'package.json'));
  try { return require('@playwright/test'); } catch (e) { fail(`Playwright not found in ${WEBAPP}/node_modules — run pnpm install in ${WEB}. (${e.message})`); }
}
/** Parse a Rails Server-Timing header into { name: ms }. */
function serverTiming(h) {
  const o = {};
  for (const part of (h || '').split(',')) { const m = part.trim().match(/^([^;]+);dur=([\d.]+)/); if (m) o[m[1]] = Number(m[2]); }
  return o;
}

/** Attach console / page-error / network observers to a page. report() returns everything seen so far. */
function observe(page, apiBase) {
  const consoleMsgs = [], errors = [], requests = [];
  const started = new WeakMap();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 500) }); });
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 500)));
  page.on('request', (r) => started.set(r, Date.now()));
  page.on('requestfailed', (r) => requests.push({ method: r.method(), url: r.url(), status: 0, failed: r.failure()?.errorText, ms: Date.now() - (started.get(r) || Date.now()) }));
  page.on('response', async (res) => {
    const r = res.request();
    const h = res.headers();
    const entry = { method: r.method(), url: res.url(), status: res.status(), type: r.resourceType(), ms: Date.now() - (started.get(r) || Date.now()) };
    if (h['x-request-id']) entry.requestId = h['x-request-id'];
    if (h['x-runtime']) entry.backendMs = Math.round(Number(h['x-runtime']) * 1000);
    if (h['server-timing']) { const st = serverTiming(h['server-timing']); entry.sqlMs = st['sql.active_record']; entry.actionMs = st['process_action.action_controller']; }
    requests.push(entry);
  });
  return {
    report() {
      const api = requests.filter((r) => apiBase && r.url.startsWith(apiBase));
      const failed = requests.filter((r) => r.status === 0 || r.status >= 400);
      return { console: consoleMsgs, pageErrors: errors, requests: requests.length, failed, api: api.sort((a, b) => b.ms - a.ms) };
    },
  };
}

const traceFile = (slug) => path.join(P.traces, `${stamp()}-${slug}.zip`);
async function startTrace(context) { await context.tracing.start({ screenshots: true, snapshots: true, sources: true }); }
async function stopTrace(context, file) { await context.tracing.stop({ path: file }); log(`trace → ${path.relative(USER_CWD, file)}   (verify-suppco trace ${path.relative(USER_CWD, file)} opens it)`); }

function summarize(rep) {
  const parts = [`${rep.requests} requests`, `${rep.api.length} api calls`];
  if (rep.api[0]) parts.push(`slowest api ${rep.api[0].ms}ms ${rep.api[0].method} ${new URL(rep.api[0].url).pathname}${rep.api[0].backendMs != null ? ` (backend ${rep.api[0].backendMs}ms, sql ${rep.api[0].sqlMs ?? '?'}ms)` : ''}`);
  if (rep.failed.length) parts.push(c(31, `${rep.failed.length} failed: ${rep.failed.slice(0, 3).map((f) => `${f.status || f.failed} ${new URL(f.url).pathname}`).join(', ')}`));
  if (rep.console.length || rep.pageErrors.length) parts.push(c(33, `${rep.console.length} console errors/warnings, ${rep.pageErrors.length} page errors`));
  return parts.join('  ·  ');
}

async function browserContext(cfg, { as, headed = false, viewport, devtools } = {}) {
  const storageState = as ? (await identity(cfg, as)).storageState : undefined;   // may boot Rails: resolve before launching Chromium
  const { chromium } = playwright();
  const browser = await chromium.launch({ headless: !headed && !devtools, devtools: !!devtools });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: WEB_URL, storageState, viewport: viewport || { width: 1280, height: 900 } });
  return { browser, context };
}

async function clearThrottle() {
  const r = await sh('sh', ['-c', "redis-cli -n 1 --scan --pattern '*rack::attack*' | xargs -r redis-cli -n 1 del >/dev/null; echo cleared"]);
  return r.code === 0;
}

function newestLoginCode(cfg, since) {
  const dir = path.join(dirs(cfg).backend, 'tmp/letter_opener');
  if (!fs.existsSync(dir)) return null;
  const emailDirs = fs.readdirSync(dir).map((d) => { const p = path.join(dir, d); return { p, mtime: fs.statSync(p).mtimeMs }; })
    .filter((d) => d.mtime >= since).sort((a, b) => b.mtime - a.mtime);
  for (const { p: d } of emailDirs) {
    for (const f of ['rich.html', 'plain.html']) {
      const p = path.join(d, f);
      if (!fs.existsSync(p)) continue;
      const html = fs.readFileSync(p, 'utf8').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      // The code sits alone inside a styled <div> right after "login code:"; never accept hex colours like #222222.
      const m = html.match(/login code:[\s\S]{0,800}?>\s*(\d{6})\s*</i) || html.match(/(?<![#\w])(\d{6})(?!\w)/);
      if (m) return m[1];
    }
  }
  return null;
}

/** Real passwordless login through the browser. Local: fully automatic via letter_opener. Remote: headed, human types the code. */
async function realLogin(cfg, email) {
  const local = cfg.api === 'local';
  const [b, w] = await Promise.all([local ? backendHealthy() : true, webHealthy()]);
  if (!b) fail(`backend is not up at ${BACKEND_URL} — run: verify-suppco up`);
  if (!w) fail(`web is not up at ${WEB_URL} — run: verify-suppco up`);
  if (local) await clearThrottle();
  const { chromium } = playwright();
  const browser = await chromium.launch({ headless: local });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: WEB_URL });
  const page = await context.newPage();
  const started = Date.now();
  try {
    await page.goto('/login?login=true');
    await page.waitForURL('**/auth/login**', { timeout: 30000 });
    if (!local) {
      log(`complete the login for ${email} in the browser window (code arrives in that inbox); waiting up to 10 minutes`);
      await page.waitForURL((u) => !/\/auth\//.test(u.pathname) && u.origin === WEB_URL, { timeout: 600000 });
    } else {
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 15000 });
      await emailInput.fill(email);
      // The real Turnstile script renders the .cf-turnstile div and fills a hidden input; the dev credentials use
      // Cloudflare's always-pass test keys, so it solves itself in headless Chromium. Submit only once it has.
      await page.waitForFunction(() => (document.querySelector('input[name="cf-turnstile-response"]')?.value || '').length > 0, null, { timeout: 30000 })
        .catch(() => { throw new Error('Turnstile never produced a token (is the backend on real Cloudflare keys? the shim uses the always-pass test keys)'); });
      await emailInput.locator('xpath=ancestor::form').locator('input[type="submit"], button[type="submit"]').first().click();
      await page.waitForURL('**/auth/code**', { timeout: 30000 }).catch(async () => {
        const flash = await page.locator('body').innerText().catch(() => '');
        throw new Error(`did not reach /auth/code (still at ${page.url()}). Page said: ${flash.slice(0, 300)}`);
      });
      const code = await waitFor(async () => newestLoginCode(cfg, started - 2000), { timeoutMs: 20000, everyMs: 500, label: 'a login-code email in backend/tmp/letter_opener' });
      const codeInput = page.locator('input[name="code"]').first();
      await codeInput.waitFor({ state: 'visible', timeout: 15000 });
      await codeInput.fill(code);
      await page.evaluate(() => { const i = document.querySelector('input[name="code"]'); HTMLFormElement.prototype.submit.call(i.form); });
      await page.waitForURL((u) => u.origin === WEB_URL && !/\/auth\//.test(u.pathname) && !/^\/login/.test(u.pathname), { timeout: 60000 });
    }
    const cookies = await context.cookies();
    const sess = cookies.find((k) => k.name === SESSION_COOKIE);
    if (!sess) throw new Error('login finished but no session cookie was set');
    const { decode } = await authjs();
    const tok = await decode({ token: sess.value, secret: authSecret(), salt: SESSION_COOKIE }).catch(() => null);
    const auth = {
      email, api: cfg.api, db: local ? cfg.db : undefined, mode: 'real', mintedAt: new Date().toISOString(),
      user: tok?.profile || { email }, accessToken: tok?.accessToken, refreshToken: tok?.refreshToken, expiresAt: tok?.expiresAt,
      storageState: await context.storageState(),
    };
    writeAuth(auth);
    return auth;
  } finally { await browser.close(); }
}

// ------------------------------------------------------------ arg parsing --
function parseArgs(argv, spec = {}) {
  const flags = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { rest.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      const kind = spec[k];
      if (kind === undefined) fail(`unknown flag --${k}`, 2);
      if (kind === 'bool') flags[k] = true;
      else if (kind === 'list') (flags[k] ??= []).push(inline ?? argv[++i]);
      else flags[k] = inline ?? argv[++i];
    } else if (a.startsWith('-') && a.length === 2 && spec[a]) {
      const k = spec[a]; const kind = spec[k];
      if (kind === 'bool') flags[k] = true; else if (kind === 'list') (flags[k] ??= []).push(argv[++i]); else flags[k] = argv[++i];
    } else rest.push(a);
  }
  return { flags, rest };
}
const CFG_FLAGS = { api: 'str', db: 'str', backend: 'str', web: 'str', tunnel: 'str', 'api-tunnel': 'str' };
const pick = (o, spec) => Object.fromEntries(Object.entries(o).filter(([k]) => k in spec));
function tunnelHost(value, flag) {
  if (!value) return '';
  const host = value.replace(/^https:\/\//, '').replace(/\/$/, '');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) {
    fail(`--${flag} needs a hostname or HTTPS origin, without credentials, a port, or a path`, 2);
  }
  return host.toLowerCase();
}
async function cfgFromFlags(f) {
  const o = {};
  if (f.api) o.api = f.api;
  if (f.db) o.db = f.db;
  if (f.tunnel !== undefined) o.tunnel = tunnelHost(f.tunnel, 'tunnel');
  if (f['api-tunnel'] !== undefined) o.apiTunnel = tunnelHost(f['api-tunnel'], 'api-tunnel');
  if (f.backend !== undefined) { o.backendDir = await resolveRepo('backend', f.backend); await prepareRepo('backend', o.backendDir); }
  if (f.web !== undefined) { o.webDir = await resolveRepo('web', f.web); await prepareRepo('web', o.webDir); }
  const cfg = currentConfig(o);
  target(cfg);   // validates --api
  return cfg;
}

// -------------------------------------------------------------- doctor -----
async function cmdDoctor() {
  const cfg = currentConfig();
  const rows = [];
  const add = (name, status, detail = '', fix = '') => rows.push({ name, status, detail, fix });
  let r = await mise(BACKEND, ['ruby', '-v']); add('backend ruby', r.code === 0 ? 'ok' : 'FAIL', r.stdout.trim(), 'cd backend && mise install');
  r = await mise(WEB, ['node', '-v']); add('web node', r.code === 0 ? 'ok' : 'FAIL', r.stdout.trim(), 'cd web && mise install');
  r = await mise(WEB, ['pnpm', '-v']); add('web pnpm', r.code === 0 ? 'ok' : 'FAIL', r.stdout.trim(), 'cd web && mise install');
  // The CLI's own Playwright and @auth/core load from the main clone's apps/web/node_modules, whichever --web is in effect.
  // A pnpm symlink can survive its target (an install linked into a worktree that was later deleted), so say which it is.
  const nm = ['@playwright/test', '@auth/core'].map((pkg) => {
    const p = path.join(WEBAPP, 'node_modules', pkg);
    if (fs.existsSync(path.join(p, 'package.json'))) return null;
    let link = null; try { link = fs.readlinkSync(p); } catch {}
    return link ? `${pkg} → ${link} (dangling symlink)` : `${pkg} missing`;
  }).filter(Boolean);
  add('web node_modules', nm.length ? 'FAIL' : 'ok', nm.length ? `${path.relative(ROOT, WEBAPP)}/node_modules: ${nm.join('; ')}` : path.relative(ROOT, WEBAPP), `cd ${WEB} && pnpm install`);
  for (const x of checkouts(cfg)) {
    add(`${x.role} checkout`, x.exists ? 'ok' : 'FAIL', x.exists ? `${path.relative(ROOT, x.dir)}${gitLabel(x.dir)}${x.main ? '' : '  (from --' + x.role + ')'}` : `${path.relative(ROOT, x.dir)} no longer exists (remembered from the last --${x.role})`, `${x.fix}   (main clone) or --${x.role} <branch|dir>`);
  }
  r = await sh('/opt/homebrew/opt/postgresql@17/bin/pg_isready', ['-q']); add('postgres', r.code === 0 ? 'ok' : 'FAIL', '', 'brew services start postgresql@17');
  r = await sh('redis-cli', ['ping']); add('redis', r.stdout.trim() === 'PONG' ? 'ok' : 'FAIL', '', 'brew services start redis');
  add('psql/createdb on PATH', has('psql') && has('createdb') ? 'ok' : 'FAIL', '', 'brew install libpq && brew link --force libpq');
  add('mkcert CA trusted', mkcertTrusted() ? 'ok' : 'FAIL', '', 'mkcert -install   (interactive; login only works over https)');
  const masterKey = fs.existsSync(path.join(BACKEND, 'config/master.key'));
  const shim = fs.existsSync(path.join(BACKEND, 'config/credentials/development.key'));
  add('rails credentials', masterKey ? 'ok' : shim ? 'warn' : 'FAIL', masterKey ? (shim ? 'master.key present BUT placeholder shim still shadows it' : 'master.key') : shim ? 'placeholder shim (third-party integrations are fake)' : 'none', masterKey && shim ? `rm ${BACKEND}/config/credentials/{development,test}.{key,yml.enc}` : shim ? 'get master.key from 1Password, then ./finish-setup.sh' : 'get master.key from 1Password');
  const env = webDotenv();
  add('web .env.local', env.AUTH_SECRET ? 'ok' : 'FAIL', env.AUTH_SECRET ? `AUTH_SECRET set; PUBLIC_API_URL=${env.PUBLIC_API_URL || '(unset)'} (verify-suppco overrides per --api)` : 'AUTH_SECRET missing', `cp ${WEBAPP}/.env.local.example ${WEBAPP}/.env.local and fill AUTH_SECRET`);
  for (const [name, dbn] of Object.entries(DB_ALIASES)) {
    if (!dbExists(dbn)) { add(`db ${name} (${dbn})`, name === 'dev' ? 'FAIL' : 'warn', 'missing', name === 'dev' ? 'verify-suppco db init --db dev' : `verify-suppco db pull --db ${name}   (needs heroku CLI)`); continue; }
    const hasClient = psqlLines(dbn, "select count(*) from oauth_applications where uid='web-client'")?.[0] === '1';
    add(`db ${name} (${dbn})`, hasClient ? 'ok' : 'FAIL', `exists, web-client OAuth app ${hasClient ? 'present' : 'MISSING'}`, `verify-suppco db init --db ${name}`);
  }
  const hk = herokuUser();
  add('heroku CLI (for --db prod|staging)', hk === 'missing' || hk === 'logged-out' ? 'warn' : 'ok', hk === 'logged-out' ? 'installed, not logged in' : hk, hk === 'missing' ? 'brew tap heroku/brew && brew install heroku && heroku login' : 'heroku login');
  add('playwright browsers', fs.existsSync(path.join(os.homedir(), 'Library/Caches/ms-playwright')) ? 'ok' : 'FAIL', '', `cd ${WEBAPP} && pnpm exec playwright install chromium`);
  // iOS (verify-suppco ios) — warn, not FAIL: only native builds need these.
  const xc = xcodeDevDir();
  add('xcode (verify-suppco ios)', xc.ok ? 'ok' : 'warn', xc.dir || 'no active developer dir', xc.fix);
  add('cocoapods (verify-suppco ios)', has('pod') ? 'ok' : 'warn', '', 'brew install cocoapods');
  if (xc.ok) { const rt = iosRuntimes(); add('ios simulator runtime', rt.length ? 'ok' : 'warn', rt.join(', ') || 'none installed', 'xcodebuild -downloadPlatform iOS'); }
  if (cfg.tunnel) { const st = await httpStatus(`https://${cfg.tunnel}/`, { timeoutMs: 8000 }); add('web tunnel (verify-suppco ios)', st === 200 ? 'ok' : 'warn', `https://${cfg.tunnel}/ → ${st ? `http ${st}` : 'no answer'}`, 'start cloudflared for that host (backend/README.md → Cloudflare Tunnel) and verify-suppco up'); }
  else add('web tunnel (verify-suppco ios)', 'warn', 'none configured', 'verify-suppco up --tunnel <you>-dev.supp.co   (see backend/README.md → Cloudflare Tunnel)');
  const s = readState();
  for (const role of ['backend', 'web']) {
    const i = inspect(role, s[role]);
    add(`${role} :${PORTS[role]}`, 'info', i.state === 'down' ? 'free' : `${i.state} (pids ${i.pids.join(',')})`);
  }
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const tag = r.status === 'ok' ? c(32, ' ok ') : r.status === 'warn' ? c(33, 'warn') : r.status === 'info' ? c(36, 'info') : c(31, 'FAIL');
    console.log(`${tag}  ${r.name.padEnd(width)}  ${r.detail}${r.fix && r.status !== 'ok' && r.status !== 'info' ? c(90, `   fix: ${r.fix}`) : ''}`);
  }
  if (rows.some((r) => r.status === 'FAIL')) process.exit(1);
}

// ------------------------------------------------------------------ up -----
// Per-role facts for ensureServer: which cfg keys force a restart, when a foreign server may be adopted, how to spawn.
const ROLES = {
  backend: {
    url: BACKEND_URL, healthy: backendHealthy, keys: ['db', 'backendDir', 'apiTunnel'], timeoutMs: 240000,
    label: (cfg) => `db=${cfg.db}`,
    adoptable: (cfg) => cfg.db === DEFAULTS.db && !cfg.apiTunnel,
    spawn: (cfg) => { const dir = dirs(cfg).backend; return { what: 'bin/dev', dir, cmd: 'mise', args: ['exec', '-C', dir, '--', 'bin/dev'], env: backendEnv(cfg) }; },
  },
  web: {
    url: WEB_URL, healthy: webHealthy, keys: ['api', 'webDir', 'apiTunnel', 'tunnel'], timeoutMs: 180000,
    label: (cfg) => `api=${cfg.api}`,
    adoptable: (cfg) => cfg.api === 'local' && !cfg.tunnel && !cfg.apiTunnel,
    spawn: (cfg) => { const { web, webapp } = dirs(cfg); return { what: `vite dev → ${target(cfg).apiBase}/api`, dir: web, cwd: webapp, cmd: 'mise', args: ['exec', '-C', webapp, '--', 'pnpm', 'exec', 'vite', 'dev', '--port', String(PORTS.web), '--host'], env: webEnv(cfg) }; },
  },
};

/** Make <role> run with <cfg>: reuse a healthy managed server with the same config, else (re)start it. */
async function ensureServer(role, cfg, { takeover = false, before } = {}) {
  const R = ROLES[role];
  let i = inspect(role, readState()[role]);
  // Kill every instance verify-suppco started before this one (half-dead trees, other checkouts), keeping only a healthy managed one.
  await reapRole(role, { except: i.state === 'managed' ? i.pgid : undefined });
  const s = readState();
  i = inspect(role, s[role]);
  const prev = s[role]?.config || s.config;
  const same = prev && R.keys.every((k) => (prev[k] ?? '') === (cfg[k] ?? ''));
  if (i.state === 'managed' && same && (await R.healthy())) { ok(`${role} already up  ${R.url}  ${R.label(cfg)}`); return s[role]; }
  if (i.state === 'managed') await killGroup(i.pgid, PORTS[role], `${role} (config changed)`);
  if (i.state === 'foreign') {
    if (takeover) { for (const g of i.pgids) await killGroup(g, PORTS[role], `foreign ${role}`); }
    else if (R.adoptable(cfg) && (await R.healthy())) {
      warn(`adopting a ${role} verify-suppco did not start on :${PORTS[role]} (pids ${i.pids.join(',')}); its config is unverified. Use --takeover to replace it.`);
      return { foreign: true, pids: i.pids };
    } else fail(`:${PORTS[role]} is held by a process verify-suppco did not start (pids ${i.pids.join(',')}) and you asked for ${R.label(cfg)}. Re-run with --takeover to replace it, or stop it yourself.`);
  }
  if (before) await before();
  const sp = R.spawn(cfg);
  log(`starting ${role}  ${sp.what}  ${R.label(cfg)}  ${path.relative(ROOT, sp.dir) || role}${gitLabel(sp.dir)}`);
  const rec = spawnServer(role, sp.cmd, sp.args, { cwd: sp.cwd || sp.dir, env: sp.env });
  rec.config = { ...cfg };
  updateState((st) => { st[role] = rec; st.config = { ...cfg }; });
  try {
    await waitFor(async () => {
      if (!alive(rec.pid)) throw new Error(`${role} process exited early:\n${tailLog(rec.log, 40)}`);
      return R.healthy(5000);
    }, { timeoutMs: R.timeoutMs, everyMs: 1500, label: `${role} ${R.url} → 200` });
  } catch (e) { fail(`${e.message}\n--- ${rec.log} ---\n${tailLog(rec.log, 40)}`); }
  ok(`${role} up  ${R.url}  ${R.label(cfg)}  pid ${rec.pid}`);
  return rec;
}

/** Database checks that must pass before a backend boots: existence (mirror is built on demand) and pending migrations. */
async function ensureDatabase(cfg, { migrate }) {
  const exists = dbExists(cfg.db);
  if (!exists && MIRRORS[cfg.db]) { log(`${cfg.db} does not exist yet; building the ${MIRRORS[cfg.db].label} mirror`); await dbPull(cfg, []); }
  else if (!exists) fail(`database ${cfg.db} does not exist. Create it with: verify-suppco db init --db ${cfg.db}`);
  const pending = pendingMigrations(cfg);
  if (!pending.length) return;
  if (!migrate) fail(`${path.relative(ROOT, dirs(cfg).backend)} has migrations that ${cfg.db} has not run:\n${pending.join('\n')}\nRe-run with --migrate to apply them to ${cfg.db}, or use a copy: verify-suppco db clone ${cfg.db} <new-db> && verify-suppco up --db <new-db> --migrate`);
  log(`running db:migrate against ${cfg.db}`);
  const m = await rails(cfg, ['db:migrate'], { inherit: true });
  if (m.code !== 0) fail('db:migrate failed');
}

const UP_FLAGS = { ...CFG_FLAGS, as: 'str', role: 'str', takeover: 'bool', 'no-web': 'bool', 'no-backend': 'bool', real: 'bool', migrate: 'bool' };
async function cmdUp(argv) {
  const { flags } = parseArgs(argv, UP_FLAGS);
  await doUp(flags);
}
/** Boot per flags; returns { cfg, auth } where auth is the session when --as was given. */
async function doUp(flags) {
  const cfg = await cfgFromFlags(flags);
  assertCheckouts(cfg);
  if (cfg.api !== 'local' && flags.db) warn(`--db is ignored with --api ${cfg.api} (the remote backend owns its database)`);
  // vite's mkcert plugin needs the trusted CA; fail early with the one interactive fix.
  if (!mkcertTrusted()) fail('mkcert CA is not trusted; run `mkcert -install` once (interactive), then retry');
  if (cfg.api === 'local' && !flags['no-backend']) await ensureServer('backend', cfg, { takeover: !!flags.takeover, before: () => ensureDatabase(cfg, { migrate: !!flags.migrate }) });
  if (!flags['no-web']) {
    const env = webEnv(cfg);
    if (cfg.api !== 'local' && (!env.OAUTH_CLIENT_SECRET || env.OAUTH_CLIENT_SECRET === 'development_secret')) {
      warn(`no real web-client secret for ${cfg.api}: browsing works, login will fail. Put OAUTH_CLIENT_SECRET=... in ${path.relative(ROOT, P.env)}/${cfg.api}.env (from 1Password "Web .env.local").`);
    }
    await ensureServer('web', cfg, { takeover: !!flags.takeover });
  }
  updateState((s) => { s.config = { ...cfg }; });
  let auth = null;
  if (flags.as) {
    auth = flags.real || cfg.api !== 'local' ? await realLogin(cfg, flags.as) : await mintLogin(cfg, flags.as, flags.role);
    ok(`logged in as ${auth.email}  (${auth.mode}; token expires ${new Date(auth.expiresAt * 1000).toLocaleTimeString()})  ${path.relative(USER_CWD, authFile(auth.email))}`);
  }
  return { cfg, auth };
}

/** Manual testing: boot, then hand the human a browser that is already logged in, and a cheat-sheet. */
async function cmdDev(argv) {
  const { flags, rest } = parseArgs(argv, { ...UP_FLAGS, devtools: 'bool', 'no-browser': 'bool' });
  const { cfg, auth } = await doUp(flags);
  const route = rest[0] || (auth ? '/home/today' : '/');
  const url = `${WEB_URL}${route}`;
  if (!flags['no-browser']) {
    if (auth) {
      openDetached(route, { as: auth.email, devtools: flags.devtools });
      ok(`opened a persistent Chromium at ${url} logged in as ${auth.email} (profile .verify-suppco/browser/, keeps cookies across runs)`);
    } else {
      spawnSync('open', [url], { stdio: 'ignore' });
      ok(`opened ${url} in your default browser`);
    }
  }
  console.log(`
  web       ${WEB_URL}        api → ${target(cfg).apiBase}/api${cfg.api === 'local' ? `        db=${cfg.db}` : ''}
  ${cfg.api === 'local' ? `sidekiq   ${BACKEND_URL}/sidekiq
  ` : ''}logs      verify-suppco logs rails -f          verify-suppco logs backend -f          verify-suppco logs web -f
  login     type any email on the login page → code lands in backend/tmp/letter_opener (a tab opens; or: verify-suppco code)
            or skip the flow:  verify-suppco open /home/today --as <email> --persistent --detach    (minted session, no email)
  users     brandon@supp.co admin · editor@supp.co editor · baller@monsterinbox.com customer
  reset     verify-suppco throttle clear   (3 login codes / email / 30 min)          verify-suppco down   when finished
`);
}
const openDetached = (route, { as, devtools } = {}) => spawnDetachedSelf(['open', route, ...(as ? ['--as', as] : []), '--persistent', ...(devtools ? ['--devtools'] : [])], 'browser');

/** Newest passwordless login code from letter_opener (the manual flow's "email"). */
async function cmdCode(argv) {
  const { flags } = parseArgs(argv, { wait: 'bool' });
  const cfg = currentConfig();
  const since = flags.wait ? Date.now() : 0;
  const code = flags.wait
    ? await waitFor(async () => newestLoginCode(cfg, since - 1000), { timeoutMs: 120000, everyMs: 500, label: 'a new login-code email' })
    : newestLoginCode(cfg, 0);
  if (!code) fail('no login-code email in backend/tmp/letter_opener yet — request a code on the login page first (or use --wait)');
  out(code + '\n');
}

async function cmdDown(argv) {
  const { flags } = parseArgs(argv, { all: 'bool' });
  const s = readState();
  for (const role of ['web', 'backend']) {
    const i = inspect(role, s[role]);
    if (i.state === 'managed') { await killGroup(i.pgid, PORTS[role], role); ok(`${role} stopped`); }
    else if (i.state === 'foreign') {
      if (flags.all) { for (const g of i.pgids) await killGroup(g, PORTS[role], `foreign ${role}`); ok(`foreign ${role} stopped`); }
      else warn(`${role} on :${PORTS[role]} was not started by verify-suppco (pids ${i.pids.join(',')}); left running. Use --all to stop it too.`);
    } else log(`${role} already down`);
    if (i.state !== 'foreign' || flags.all) updateState((st) => { delete st[role]; });
    const reaped = await reapRole(role);
    if (reaped) ok(`reaped ${reaped} orphaned ${role} process group(s)`);
  }
}

// -------------------------------------------------------------- status -----
async function gatherStatus() {
  const s = readState();
  const cfg = currentConfig();
  const t = target(cfg);
  const b = inspect('backend', s.backend);
  const w = inspect('web', s.web);
  const [bh, wh] = await Promise.all([
    b.state === 'down' ? 0 : httpStatus(`${BACKEND_URL}/up`, { timeoutMs: 5000 }),
    w.state === 'down' ? 0 : httpStatus(`${WEB_URL}/`, { timeoutMs: 15000 }),
  ]);
  const sessions = fs.readdirSync(P.auth).filter((f) => f.endsWith('.json')).map((f) => {
    const a = readAuth(f.replace(/\.json$/, ''));
    return a && { email: a.email, api: a.api, db: a.db, mode: a.mode, fresh: fresh(a), expiresAt: a.expiresAt };
  }).filter(Boolean);
  const live = ownProcesses();
  return {
    config: cfg,
    backend: cfg.api === 'local' ? { ...b, url: BACKEND_URL, health: bh, db: cfg.db, pid: s.backend?.pid, log: s.backend?.log } : { state: 'remote', url: t.apiBase },
    web: { ...w, url: WEB_URL, health: wh, apiUrl: `${t.apiBase}/api`, pid: s.web?.pid, log: s.web?.log },
    repos: Object.fromEntries(checkouts(cfg).map((x) => [x.role, { dir: x.dir, missing: !x.exists, ...(gitInfo(x.dir) || {}) }])),
    sessions, pulls: s.pulls || {}, ios: s.ios,
    orphans: ['backend', 'web'].flatMap((role) => [...new Set(live.filter((p) => p.role === role).map((p) => p.pgid))]
      .filter((g) => g !== s[role]?.pgid).map((pgid) => ({ role, pgid }))),
  };
}
async function cmdStatus(argv) {
  const { flags } = parseArgs(argv, { json: 'bool' });
  const st = await gatherStatus();
  if (flags.json) return out(st);
  const line = (name, x, extra) => console.log(`${name.padEnd(8)} ${String(x.state).padEnd(8)} ${x.url.padEnd(30)} ${x.health ? `http ${x.health}` : ''}  ${extra}`);
  for (const [k, r] of Object.entries(st.repos)) console.log(`repo     ${k.padEnd(8)} ${path.relative(ROOT, r.dir) || k}  ${r.missing ? c(31, `MISSING — verify-suppco up --${k} ${k}`) : `@ ${r.branch || '?'} ${r.sha || ''}${r.dirty ? '*' : ''}`}`);
  line('backend', st.backend, st.backend.state === 'remote' ? `(api=${st.config.api})` : `db=${st.backend.db}${st.backend.pid ? `  pid ${st.backend.pid}` : ''}`);
  line('web', st.web, `api=${st.config.api} → ${st.web.apiUrl}${st.web.pid ? `  pid ${st.web.pid}` : ''}`);
  for (const a of st.sessions) console.log(`session  ${a.email}  ${a.mode}  ${a.api}${a.db ? '/' + a.db : ''}  ${a.fresh ? 'fresh' : 'stale'}${a.expiresAt ? `  (until ${new Date(a.expiresAt * 1000).toLocaleTimeString()})` : ''}`);
  for (const [db, p] of Object.entries(st.pulls)) console.log(`pull     ${db}  ${p.at}  ${Array.isArray(p.tables) ? p.tables.join(',') : p.tables}`);
  if (st.ios) console.log(`ios      ${st.ios.target.padEnd(8)} loads ${st.ios.origin}  scheme "${IOS.schemes[st.ios.target]}"  synced ${st.ios.syncedAt}  ${path.relative(ROOT, st.ios.webapp)}`);
  for (const o of st.orphans) console.log(c(33, `orphan   ${o.role} pgid ${o.pgid} started by verify-suppco but not the current instance — verify-suppco down reaps it`));
}

async function cmdLogs(argv) {
  const { flags, rest } = parseArgs(argv, { n: 'str', '-n': 'n', follow: 'bool', '-f': 'follow', grep: 'str' });
  const which = rest[0];
  const files = { backend: path.join(P.logs, 'backend.log'), web: path.join(P.logs, 'web.log'), rails: path.join(dirs(currentConfig()).backend, 'log/development.log') };
  if (!files[which]) fail('usage: verify-suppco logs <backend|web|rails> [-n N] [-f] [--grep regex]\n  backend = foreman stdout (puma + sidekiq + vite)   rails = backend/log/development.log (request lines, SQL, errors)', 2);
  const file = files[which];
  if (!fs.existsSync(file)) fail(`${file} does not exist yet`);
  const n = flags.n || '80';
  if (!flags.grep) { const r = await sh('tail', ['-n', n, ...(flags.follow ? ['-f'] : []), file], { inherit: true }); process.exit(r.code); }
  // grep the recent window, then cap what reaches the caller so a busy log cannot flood it.
  const q = (x) => `'${x.replace(/'/g, `'\\''`)}'`;
  const cmd = flags.follow
    ? `tail -n 5000 -f ${q(file)} | grep --line-buffered -E ${q(flags.grep)}`
    : `tail -n 5000 ${q(file)} | grep -E ${q(flags.grep)} | tail -n ${q(n)}`;
  const r = await sh('sh', ['-c', cmd], { inherit: true });
  process.exit(r.code === 1 && !flags.follow ? 0 : r.code);
}

const JOBS_RB = `
require 'sidekiq/api'
st = Sidekiq::Stats.new
queues = Sidekiq::Queue.all.map { |q| { name: q.name, size: q.size, latency_s: q.latency.round(1) } }
retries = Sidekiq::RetrySet.new.first(10).map { |j| { class: j.klass, args: j.args.to_s[0, 120], error: "#{j['error_class']}: #{j['error_message'].to_s[0, 160]}", at: j.at&.iso8601 } }
dead = Sidekiq::DeadSet.new.to_a.last(10).reverse.map { |j| { class: j.klass, args: j.args.to_s[0, 120], error: "#{j['error_class']}: #{j['error_message'].to_s[0, 160]}", at: j.at&.iso8601 } }
busy = Sidekiq::Workers.new.map { |_pid, _tid, w| { class: w.dig('payload', 'class'), queue: w['queue'], run_at: Time.at(w['run_at']).iso8601 } }
payload = { processed: st.processed, failed: st.failed, enqueued: st.enqueued, scheduled: st.scheduled_size, retry: st.retry_size, dead: st.dead_size,
            processes: st.processes_size, queues: queues, busy: busy, retries: retries, dead_jobs: dead }
if ENV['VERIFY_JOBS_CLEAR'] == '1'
  Sidekiq::Queue.all.each(&:clear); Sidekiq::RetrySet.new.clear; Sidekiq::ScheduledSet.new.clear; Sidekiq::DeadSet.new.clear
  payload[:cleared] = true
end
`;
async function cmdJobs(argv) {
  const { flags, rest } = parseArgs(argv, { ...CFG_FLAGS, yes: 'bool' });
  const cfg = await cfgFromFlags(flags);
  const clear = rest[0] === 'clear';
  if (clear && !flags.yes) fail('verify-suppco jobs clear empties every Sidekiq queue, retry, scheduled and dead set in the shared Redis — re-run with --yes', 2);
  out(await railsJson(cfg, JOBS_RB, clear ? { VERIFY_JOBS_CLEAR: '1' } : {}, 'reading Sidekiq state'));
}

// --------------------------------------------------------------- login -----
async function cmdLogin(argv) {
  const { flags, rest } = parseArgs(argv, { role: 'str', real: 'bool', json: 'bool', ...CFG_FLAGS });
  const email = rest[0];
  if (!email || !email.includes('@')) fail('usage: verify-suppco login <email> [--role admin|editor|customer] [--real] [--json]', 2);
  const cfg = await cfgFromFlags(flags);
  const a = flags.real || cfg.api !== 'local' ? await realLogin(cfg, email) : await mintLogin(cfg, email, flags.role);
  if (flags.json) return out({ email: a.email, mode: a.mode, api: a.api, db: a.db, user: a.user, expiresAt: a.expiresAt, file: authFile(a.email) });
  ok(`${a.email}  ${a.mode}  role=${a.user?.role ?? '?'}  expires ${a.expiresAt ? new Date(a.expiresAt * 1000).toLocaleTimeString() : '?'}  → ${path.relative(USER_CWD, authFile(a.email))}`);
}

// ----------------------------------------------------------------- api -----
async function cmdApi(argv) {
  const { flags, rest } = parseArgs(argv, { as: 'str', json: 'str', form: 'list', header: 'list', '-H': 'header', expect: 'str', raw: 'bool' });
  let [method, p] = rest;
  if (method && method.startsWith('/')) { p = method; method = 'GET'; }
  if (!p) fail('usage: verify-suppco api [METHOD] </api/path> [--as email] [--json \'{...}\'] [--form k=v]... [-H "K: V"]... [--expect 200] [--raw]', 2);
  const cfg = currentConfig();
  const t = target(cfg);
  const url = p.startsWith('http') ? p : `${t.apiBase}${p.startsWith('/') ? '' : '/'}${p}`;
  const headers = { Accept: 'application/json' };
  for (const h of flags.header || []) { const [k, ...v] = h.split(':'); headers[k.trim()] = v.join(':').trim(); }
  if (flags.as) headers.Authorization = `Bearer ${(await identity(cfg, flags.as)).accessToken}`;
  let body;
  if (flags.json) { headers['Content-Type'] = 'application/json'; body = flags.json; }
  else if (flags.form) { body = new URLSearchParams(Object.fromEntries(flags.form.map((kv) => kv.split(/=(.*)/s).slice(0, 2)))); }
  if (url.startsWith('https://localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const res = await fetch(url, { method: method.toUpperCase(), headers, body });
  const text = await res.text();
  const st = serverTiming(res.headers.get('server-timing'));
  const timing = res.headers.get('x-runtime') ? `  rails ${Math.round(Number(res.headers.get('x-runtime')) * 1000)}ms${st['sql.active_record'] != null ? ` (sql ${Math.round(st['sql.active_record'])}ms)` : ''}` : '';
  const rid = res.headers.get('x-request-id') ? `  request-id ${res.headers.get('x-request-id')}` : '';
  console.error(`${c(res.ok ? 32 : 31, `HTTP ${res.status}`)} ${method.toUpperCase()} ${url}${timing}${rid}`);
  if (flags.raw) out(text + (text.endsWith('\n') ? '' : '\n'));
  else { try { out(JSON.parse(text)); } catch { out(text + '\n'); } }
  if (flags.expect) { if (String(res.status) !== flags.expect) fail(`expected HTTP ${flags.expect}, got ${res.status}`); }
  else if (!res.ok) process.exit(1);
}

// ---------------------------------------------------------------- shot -----
const ERROR_PAGE = /Oops\. Error|Internal Error|500 Internal Server Error/;
async function cmdShot(argv) {
  const { flags, rest } = parseArgs(argv, { as: 'str', out: 'str', full: 'bool', selector: 'str', width: 'str', height: 'str', wait: 'str', json: 'bool', trace: 'bool' });
  const route = rest[0] || '/';
  const cfg = currentConfig();
  const { browser, context } = await browserContext(cfg, { as: flags.as, viewport: { width: Number(flags.width || 1280), height: Number(flags.height || 900) } });
  const slug = slugify(route);
  if (flags.trace) await startTrace(context);
  try {
    const page = await context.newPage();
    const obs = observe(page, target(cfg).apiBase);
    const resp = await page.goto(route, { waitUntil: 'load', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: Number(flags.wait || 8000) }).catch(() => {});
    if (flags.selector) await page.locator(flags.selector).first().waitFor({ state: 'visible', timeout: 15000 });
    const file = flags.out ? userPath(flags.out) : path.join(P.shots, `${stamp()}-${slug}${flags.as ? '-' + flags.as.split('@')[0] : ''}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (flags.selector) await page.locator(flags.selector).first().screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: !!flags.full });
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const errorPage = ERROR_PAGE.test(bodyText);
    const requested = new URL(route, WEB_URL);
    const redirected = new URL(page.url()).pathname !== requested.pathname;
    const rep = obs.report();
    const result = { file, requested: requested.pathname, url: page.url(), redirected, title: await page.title(), status: resp?.status(), as: flags.as || null, errorPage, network: rep };
    fs.writeFileSync(file.replace(/\.png$/, '') + '.json', JSON.stringify(result, null, 2));
    if (flags.trace) await stopTrace(context, traceFile(slug));
    if (flags.json) out(result);
    else console.log(`${file}\n${result.status} ${result.url}  "${result.title}"${redirected ? c(33, `  REDIRECTED from ${requested.pathname}`) : ''}${errorPage ? c(31, '  ERROR PAGE') : ''}\n${summarize(rep)}   (details: ${path.basename(file, '.png')}.json)`);
    if (errorPage || (resp && resp.status() >= 400)) process.exit(1);
  } finally { await browser.close(); }
}

async function cmdOpen(argv) {
  const { flags, rest } = parseArgs(argv, { as: 'str', devtools: 'bool', persistent: 'bool', detach: 'bool' });
  const route = rest[0] || '/';
  if (flags.detach) {
    openDetached(route, { as: flags.as, devtools: flags.devtools });
    return ok(`browser opening at ${route}${flags.as ? ` as ${flags.as}` : ''} (detached; log: .verify-suppco/logs/browser.log)`);
  }
  const cfg = currentConfig();
  if (flags.persistent) {
    // A real, reusable profile: cookies, localStorage and devtools state survive between runs — for hands-on testing.
    const a = flags.as ? await identity(cfg, flags.as) : null;
    const { chromium } = playwright();
    const dir = path.join(P.browser, 'default');
    fs.mkdirSync(dir, { recursive: true });
    const context = await chromium.launchPersistentContext(dir, { headless: false, devtools: !!flags.devtools, ignoreHTTPSErrors: true, baseURL: WEB_URL, viewport: null, args: ['--window-size=1400,1000'] });
    if (a) {
      await context.clearCookies({ name: SESSION_COOKIE }).catch(() => {});
      await context.addCookies(a.storageState.cookies);
    }
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(route);
    log(`persistent browser open${flags.as ? ` as ${flags.as}` : ''} (profile ${path.relative(ROOT, dir)}); close the window to finish`);
    await new Promise((r) => context.on('close', r));
    return;
  }
  const { browser, context } = await browserContext(cfg, { as: flags.as, headed: true, devtools: flags.devtools });
  const page = await context.newPage();
  await page.goto(route);
  log(`browser open${flags.as ? ` as ${flags.as}` : ''}; close the window (or Ctrl-C) to finish`);
  await new Promise((r) => { browser.on('disconnected', r); context.on('close', r); page.on('close', r); });
  await browser.close().catch(() => {});
}

async function cmdPw(argv) {
  const { flags, rest } = parseArgs(argv, { as: 'str', headed: 'bool', trace: 'bool' });
  const script = rest[0];
  if (!script) fail('usage: verify-suppco pw <script.mjs> [--as email] [--headed] [--trace] [args...]\n  script: export default async ({ page, context, browser, base, api, auth, args, shots, report }) => result', 2);
  const cfg = currentConfig();
  const mod = await import(pathToFileURL(userPath(script)).href);
  const fn = mod.default || mod.run;
  if (typeof fn !== 'function') fail(`${script} must export a default async function`, 2);
  const { browser, context } = await browserContext(cfg, { as: flags.as, headed: !!flags.headed });
  const auth = flags.as ? readAuth(flags.as) : null;
  const slug = path.basename(script, path.extname(script));
  if (flags.trace) await startTrace(context);
  let obs;
  try {
    const page = await context.newPage();
    obs = observe(page, target(cfg).apiBase);
    const result = await fn({ page, context, browser, base: WEB_URL, api: target(cfg).apiBase, auth, config: cfg, args: rest.slice(1), shots: P.shots, report: () => obs.report() });
    if (result !== undefined) out(result);
    if (flags.trace) await stopTrace(context, traceFile(slug));
  } catch (e) {
    if (flags.trace) await stopTrace(context, traceFile(`${slug}-failed`)).catch(() => {});
    throw e;
  } finally {
    if (obs) console.error(summarize(obs.report()));
    await browser.close();
  }
}

async function cmdTrace(argv) {
  let file = argv[0];
  if (!file) {
    const zips = fs.readdirSync(P.traces).filter((f) => f.endsWith('.zip')).sort();
    if (!zips.length) fail('no traces yet — add --trace to verify-suppco shot / pw', 2);
    file = path.join(P.traces, zips[zips.length - 1]);
  }
  log(`opening Playwright trace viewer for ${path.relative(USER_CWD, userPath(file))}`);
  const r = await mise(WEBAPP, ['pnpm', 'exec', 'playwright', 'show-trace', userPath(file)], { inherit: true });
  process.exit(r.code);
}

// ---------------------------------------------------------- rails / sql ----
async function cmdRails(argv) {
  const { flags, rest } = parseArgs(argv, { file: 'str', '-f': 'file', ...CFG_FLAGS });
  const cfg = await cfgFromFlags(flags);
  const src = flags.file ? fs.readFileSync(userPath(flags.file), 'utf8') : rest.join(' ');
  if (!src.trim()) fail('usage: verify-suppco rails \'<ruby>\' | verify-suppco rails -f script.rb   (runs bin/rails runner against the current --db)', 2);
  const r = await railsRunner(cfg, src, {}, { inherit: true });
  process.exit(r.code);
}
async function cmdSql(argv) {
  const { flags, rest } = parseArgs(argv, { file: 'str', '-f': 'file', csv: 'bool', ...CFG_FLAGS });
  const cfg = await cfgFromFlags(flags);
  const q = rest.join(' ');
  if (!q && !flags.file) fail('usage: verify-suppco sql \'<query>\' [--csv] | verify-suppco sql -f file.sql', 2);
  const r = await psql(cfg.db, [...(flags.csv ? ['--csv'] : []), ...(flags.file ? ['-f', userPath(flags.file)] : ['-c', q])], { inherit: true });
  process.exit(r.code);
}

const DB_SUBS = {
  init: (cfg) => dbInit(cfg),
  pull: (cfg, rest, flags) => {
    if (cfg.db === DB_ALIASES.dev && !flags.yes) fail(`refusing to truncate tables in ${cfg.db} without --yes (use --db prod|staging for a mirror)`);
    return dbPull(cfg, rest);
  },
  seed: async (cfg) => {
    log(`running db:seed against ${cfg.db} (~90s)`);
    const r = await rails(cfg, ['db:seed']);
    process.stdout.write(r.stdout.slice(-3000));
    if (r.code !== 0 && /ModelCount|undefined method 'to_i'/.test(r.stderr)) return warn('db:seed exited 1 in its final summary print (known ModelCount#to_s bug); data seeding itself completed');
    if (r.code !== 0) fail(`db:seed failed:\n${r.stderr.slice(-3000)}`);
    ok('seeded');
  },
  drop: async (cfg, rest, flags) => {
    if (cfg.db === DB_ALIASES.dev) fail('refusing to drop api_development');
    if (!flags.yes) fail(`drop ${cfg.db}? re-run with --yes`);
    const r = await sh('dropdb', ['--if-exists', cfg.db]); if (r.code !== 0) fail(r.stderr); ok(`dropped ${cfg.db}`);
  },
  clone: async (cfg, [from, to]) => {
    if (!from || !to) fail('usage: verify-suppco db clone <from-db> <to-db>   (createdb -T; the source must have no open connections — verify-suppco down first)', 2);
    if (!dbExists(from)) fail(`${from} does not exist`);
    if (dbExists(to)) fail(`${to} already exists`);
    log(`cloning ${from} → ${to}`);
    const r = await sh('createdb', ['-T', from, to]);
    if (r.code !== 0) fail(`createdb -T failed (a running backend holds connections to ${from}? run verify-suppco down):\n${r.stderr}`);
    await setDbEnvironment(cfg, to);
    ok(`${to} ready — verify-suppco up --db ${to}`);
  },
  list: (cfg) => {
    const aliasOf = (n) => Object.entries(DB_ALIASES).find(([, v]) => v === n)?.[0];
    for (const n of psqlLines(null, "select datname from pg_database where datname like 'api_%' order by 1") || []) console.log(`${n}${n === cfg.db ? '   (current)' : ''}${aliasOf(n) ? `   alias: ${aliasOf(n)}` : ''}`);
  },
};
async function cmdDb(argv) {
  const sub = DB_SUBS[argv[0]];
  if (!sub) fail('usage: verify-suppco db <init|pull [tables...]|seed|drop|list|clone <from> <to>> [--db dev|prod|<name>]', 2);
  const { flags, rest } = parseArgs(argv.slice(1), { ...CFG_FLAGS, yes: 'bool' });
  return sub(await cfgFromFlags(flags), rest, flags);
}

async function cmdThrottle(argv) {
  if (argv[0] !== 'clear') fail('usage: verify-suppco throttle clear   (removes Rack::Attack counters in redis db 1)', 2);
  await clearThrottle(); ok('Rack::Attack counters cleared');
}

async function cmdEnv(argv) {
  const { flags } = parseArgs(argv, { ...CFG_FLAGS, unredacted: 'bool' });
  const cfg = await cfgFromFlags(flags);
  assertCheckouts(cfg);
  const red = (k, v) => (REDACT.test(k) && !flags.unredacted && v ? v.slice(0, 3) + '…' : v);
  console.log(`# config: ${JSON.stringify(cfg)}`);
  console.log('# backend (bin/dev):'); for (const [k, v] of Object.entries(backendEnv(cfg))) console.log(`${k}=${red(k, v)}`);
  console.log('# web (vite dev), overriding apps/web/.env.local:'); for (const [k, v] of Object.entries(webEnv(cfg))) console.log(`${k}=${red(k, v)}`);
}

// ----------------------------------------------------------------- ios -----
function iosRuntimes() {
  const r = spawnSync('xcrun', ['simctl', 'list', 'runtimes', '-j'], { encoding: 'utf8' });
  if (r.status !== 0) return [];
  return (JSON.parse(r.stdout || '{}').runtimes || []).filter((x) => x.platform === 'iOS' && x.isAvailable).map((x) => x.name);
}
/** Available iOS simulators: [{ udid, name, state, runtime }]; fails when none is installed. */
function iosSimulators() {
  const r = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8' });
  const sims = r.status !== 0 ? [] : Object.entries(JSON.parse(r.stdout || '{}').devices || {})
    .filter(([rt]) => /iOS/.test(rt))
    .flatMap(([rt, ds]) => ds.map((d) => ({ udid: d.udid, name: d.name, state: d.state, runtime: rt.replace(/.*SimRuntime\./, '') })));
  if (!sims.length) fail('no iOS simulator available — run: xcodebuild -downloadPlatform iOS   (or Xcode → Settings → Components)');
  return sims;
}
function iosPreflight() {
  const xc = xcodeDevDir();
  if (!xc.ok) fail(`xcodebuild needs full Xcode as the active developer dir (now: ${xc.dir || 'none'}). Once, interactive:\n  ${xc.fix}`);
  if (!has('pod')) fail('CocoaPods missing — run: brew install cocoapods');
}

const IOS_FLAGS = { ...CFG_FLAGS, target: 'str', device: 'str', 'no-web': 'bool', takeover: 'bool' };
const IOS_STEPS = { up: ['sync', 'open'], sync: ['sync'], open: ['open'], run: ['sync', 'run'] };
/**
 * verify-suppco ios [up|sync|open|run|devices]. The native app is a shell that loads the web app from an origin chosen at
 * `cap sync` time, so: (dev) boot the web behind the tunnel so that origin answers → cap sync ios → Xcode or the simulator.
 */
async function cmdIos(argv) {
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'up';
  const { flags } = parseArgs(argv[0] === sub ? argv.slice(1) : argv, IOS_FLAGS);
  iosPreflight();
  if (sub === 'devices') {
    for (const d of iosSimulators()) console.log(`${d.state.padEnd(9)} ${d.udid}  ${d.name}  (${d.runtime})`);
    return;
  }
  if (!IOS_STEPS[sub]) fail('usage: verify-suppco ios [up|sync|open|run|devices] [--target dev|staging|prod] [--tunnel host] [--api-tunnel host] [--device name|udid] [--no-web] [--web <branch|dir>]', 2);
  const tgt = flags.target || readState().ios?.target || 'dev';
  if (!IOS.schemes[tgt]) fail(`--target must be dev|staging|prod (got ${tgt})`, 2);
  // dev target: the shell loads the web app from this Mac through the Cloudflare tunnel (real cert, native sign-in
  // possible, works on a device too). Without a tunnel capacitor.config.ts falls back to plain http, which the native
  // auth plugin rejects, so verify-suppco requires one.
  const needWeb = tgt === 'dev' && !flags['no-web'] && (sub === 'up' || sub === 'run');
  const cfg = needWeb ? (await doUp({ ...pick(flags, CFG_FLAGS), ...(flags.takeover ? { takeover: true } : {}) })).cfg : await cfgFromFlags(pick(flags, CFG_FLAGS));
  if (tgt === 'dev' && !cfg.tunnel) fail('verify-suppco ios needs the web tunnel: verify-suppco up --tunnel <you>-dev.supp.co   (backend/README.md → Cloudflare Tunnel; the route must reach this Mac)', 2);
  if (needWeb && cfg.api === 'local' && !cfg.apiTunnel) warn('native sign-in needs the named API tunnel too: --api-tunnel <you>-api.supp.co (an existing route to this Mac). Browsing works without it.');
  const origin = tgt === 'dev' ? `https://${cfg.tunnel}` : tgt === 'staging' ? 'https://staging.supp.co' : 'https://app.supp.co';
  if (needWeb && (await httpStatus(`${origin}/`)) !== 200) warn(`${origin}/ is not answering — start cloudflared for ${cfg.tunnel} (and add it to WKAppBoundDomains in Dev-Info.plist), or the app shows a blank page`);
  const webapp = dirs(cfg).webapp;
  const ws = path.join(webapp, 'ios/App/App.xcworkspace');
  if (!fs.existsSync(ws)) fail(`no iOS project at ${ws}`);
  const scheme = IOS.schemes[tgt];

  const steps = {
    async sync() {
      // webDir is `static`, so no `pnpm build` is needed: sync copies static assets, writes capacitor.config.json, runs pod install.
      // Skip when nothing that feeds the sync changed (an explicit `verify-suppco ios sync` always runs).
      const inputs = ['capacitor.config.ts', 'package.json', 'ios/App/Podfile'].map((f) => path.join(webapp, f)).filter(fs.existsSync);
      const key = JSON.stringify({ tgt, tunnel: cfg.tunnel, webapp, hashes: inputs.map(fileHash) });
      const prev = readState().ios;
      if (sub !== 'sync' && prev?.key === key && fs.existsSync(path.join(webapp, 'ios/App/Pods'))) return log(`cap sync ios skipped — unchanged since ${prev.syncedAt} (verify-suppco ios sync forces it)`);
      log(`cap sync ios  TARGET=${tgt}${tgt === 'dev' ? `  SUPP_DEV_TUNNEL=${cfg.tunnel}` : ''}  ${path.relative(ROOT, webapp)}  → app loads ${origin}`);
      const r = await mise(webapp, ['pnpm', 'run', 'sync:ios'], { cwd: webapp, env: { TARGET: tgt, SUPP_DEV_TUNNEL: tgt === 'dev' ? cfg.tunnel : '' }, inherit: true });
      if (r.code !== 0) fail(`cap sync ios failed (output above). Podfile paths resolve into ${path.relative(ROOT, dirs(cfg).web)}/node_modules/.pnpm — run pnpm install there if a pod path is missing.`);
      updateState((s) => { s.ios = { target: tgt, origin, webapp, key, syncedAt: new Date().toISOString() }; });
      ok(`synced  TARGET=${tgt}  app loads ${origin}`);
    },
    async run() {
      const sims = iosSimulators();
      const dev = flags.device ? sims.find((d) => d.udid === flags.device || d.name === flags.device) : sims.find((d) => d.state === 'Booted') || sims.find((d) => /^iPhone/.test(d.name)) || sims[0];
      if (!dev) fail(`no simulator matches '${flags.device}' — see: verify-suppco ios devices`);
      // Capacitor assumes the scheme is the product name ("App Dev.app"), but Xcode builds "Dev.app".
      // Ask Xcode for the actual product (in parallel with the build), then install and launch that exact bundle.
      const derived = path.join(webapp, 'ios/DerivedData', dev.udid);
      // Xcode 27 refuses the project's iOS 14.0 deployment target (supported range starts at 15.0); override it for
      // every target in the build (App + Pods) without touching the checked-in project.
      const buildArgs = ['-workspace', ws, '-scheme', scheme, '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', `id=${dev.udid}`, '-derivedDataPath', derived, 'IPHONEOS_DEPLOYMENT_TARGET=15.0'];
      log(`xcodebuild  scheme "${scheme}"  → ${dev.name} (${dev.runtime})`);
      const [build, settings] = await Promise.all([
        sh('xcodebuild', [...buildArgs, '-quiet', 'build'], { cwd: webapp }),
        sh('xcodebuild', [...buildArgs, '-showBuildSettings', '-json'], { cwd: webapp }),
      ]);
      const buildLog = path.join(P.logs, 'ios-build.log');
      fs.writeFileSync(buildLog, build.stdout + build.stderr);
      if (build.code !== 0) fail(`iOS build failed; see ${buildLog}\n${tailLog(buildLog, 35)}`);
      if (settings.code !== 0) fail(`cannot read Xcode build products: ${settings.stderr}`);
      const product = JSON.parse(settings.stdout).map((x) => x.buildSettings).find((x) => x.WRAPPER_EXTENSION === 'app');
      if (!product?.TARGET_BUILD_DIR || !product?.FULL_PRODUCT_NAME || !product?.PRODUCT_BUNDLE_IDENTIFIER) fail('Xcode returned no installable app product');
      const appPath = path.join(product.TARGET_BUILD_DIR, product.FULL_PRODUCT_NAME);
      if (!fs.existsSync(appPath)) fail(`Xcode product not found: ${appPath}`);
      const simctl = async (args, what) => { const r = await sh('xcrun', ['simctl', ...args]); if (r.code !== 0) fail(`simulator ${what} failed: ${r.stderr}`); };
      if (dev.state !== 'Booted') await simctl(['boot', dev.udid], 'boot');
      await simctl(['bootstatus', dev.udid, '-b'], 'boot');
      await simctl(['install', dev.udid, appPath], 'install');
      await sh('xcrun', ['simctl', 'terminate', dev.udid, product.PRODUCT_BUNDLE_IDENTIFIER]);
      await simctl(['launch', dev.udid, product.PRODUCT_BUNDLE_IDENTIFIER], 'launch');
      spawnSync('open', ['-a', 'Simulator'], { stdio: 'ignore' });
      ok(`running on ${dev.name}  (loads ${origin})`);
    },
    open() {
      spawnSync('open', [ws], { stdio: 'ignore' });
      ok(`opened ${path.relative(ROOT, ws)} — pick scheme "${scheme}" + a simulator, then Run (⌘R). Open the .xcworkspace, never the .xcodeproj.`);
    },
  };
  for (const step of IOS_STEPS[sub]) await steps[step]();
  if (sub !== 'open') console.log(`
  app loads   ${origin}${tgt === 'dev' ? `        (web: verify-suppco logs web -f)` : ''}
  re-sync     verify-suppco ios sync      after changing capacitor.config.ts, plugins or --target/--tunnel
  targets     --target dev (tunnel to this Mac) | staging (staging.supp.co) | prod (app.supp.co)
`);
}

// ---------------------------------------------------------------- help -----
const HELP = `verify-suppco — boot and drive the SuppCo app deterministically

  verify-suppco doctor                           check prerequisites; prints the fix for anything red
  verify-suppco up [--api local|staging|prod] [--db dev|prod|<name>] [--as <email>] [--role r] [--real]
                   [--backend <branch|dir>] [--web <branch|dir>] [--migrate] [--tunnel host] [--api-tunnel host]
                   [--takeover] [--no-web] [--no-backend]
                                                          boot web (+ backend when --api local; default api=prod), wait for health, optionally log in
  verify-suppco dev [same flags as up] [--devtools] [--no-browser] [route]
                                                          manual testing: up, then a persistent browser already logged in (--as) + cheat-sheet
  verify-suppco code [--wait]                    newest passwordless login code from letter_opener (manual login flow)
  verify-suppco down [--all]                     stop what verify-suppco started (--all: also servers it did not start)
  verify-suppco status [--json]                  what is running, against what, and which sessions are fresh
  verify-suppco logs <backend|web|rails> [-n N] [-f] [--grep re]   backend/web = process stdout; rails = log/development.log
  verify-suppco jobs [clear --yes]               Sidekiq queues, busy workers, last retries/dead jobs (with errors)

  verify-suppco login <email> [--role r] [--real]        session for <email> → .verify-suppco/auth/<email>.json (minted on local; real login remote)
  verify-suppco api [METHOD] </api/path> [--as email] [--json '{}'] [--form k=v] [-H 'K: V'] [--expect N] [--raw]
                                                          prints rails ms, sql ms, x-request-id; exit 1 on the wrong status
  verify-suppco shot <route> [--as email] [--out f.png] [--full] [--selector css] [--trace] [--json]
                                                          screenshot + <shot>.json (console errors, failed/slow requests); exit 1 on an error page
  verify-suppco open <route> [--as email] [--devtools] [--persistent] [--detach]
                                                          headed browser for a human; --persistent keeps cookies/localStorage in .verify-suppco/browser
  verify-suppco pw <script.mjs> [--as email] [--headed] [--trace] [args...]
                                                          run a Playwright script with page/context/auth/report() injected
  verify-suppco trace [file.zip]                 open the Playwright trace viewer (latest trace by default)

  verify-suppco rails '<ruby>' | -f file.rb      bin/rails runner against the current --db
  verify-suppco sql '<query>' [--csv] | -f file.sql      psql against the current --db
  verify-suppco db init|pull [tables...]|seed|drop|list|clone <from> <to>
                                                          pull = remote tables via heroku into a mirror (--db prod → api_prod_mirror, --db staging → api_staging_mirror); clone = copy a db for a branch
  verify-suppco throttle clear                   reset Rack::Attack login counters (redis db 1)
  verify-suppco env [--unredacted]               the exact env verify-suppco gives each server

  native iOS app (Capacitor shell that loads the web app from an origin fixed at sync time)
  verify-suppco ios [up] [--target dev|staging|prod] [--api-tunnel host] [--web <branch|dir>] [--no-web]
                                                          dev: web up behind the tunnel → cap sync ios → open Xcode
  verify-suppco ios run [--device name|udid]     same, then xcodebuild + install the actual app product on a simulator
  verify-suppco ios sync | open | devices        just sync, just open App.xcworkspace, list simulators

  --api   where the web app points: local (boot Rails on :3000) | staging | prod (api.supp.co, real data, real login)
  --db    which local Postgres database Rails uses: dev = api_development (seed data) | prod = api_prod_mirror | staging = api_staging_mirror | any name
  --backend / --web   which checkout to run: backend | web (the main clone, from any cwd), a directory, or a branch → git worktree
          under .verify-suppco/worktrees/<repo>/<branch> (created on demand; .env.local / credentials / mise pins copied from the
          main clone; deps installed when the lockfile changed). The choice persists; up/env refuse a remembered checkout that is gone.
          Pending migrations block up unless --migrate.
  --tunnel host       your Cloudflare route → https://localhost:3001 (web HMR + the iOS dev origin). Defaults to $SUPP_DEV_TUNNEL.
  --api-tunnel host   your Cloudflare route → http://localhost:3000; sets the web's API/OAuth URLs and the Rails issuer (native sign-in).
  Flags persist in .verify-suppco/state.json; clear a tunnel with --tunnel "" / --api-tunnel "".
  Remote targets read extra env from .verify-suppco/env/<api>.env (e.g. OAUTH_CLIENT_SECRET from 1Password).
  State: .verify-suppco/state.json · logs: .verify-suppco/logs · sessions: .verify-suppco/auth · screenshots: .verify-suppco/shots
`;

// ---------------------------------------------------------------- main -----
const [cmd, ...argv] = process.argv.slice(2);
const table = {
  doctor: cmdDoctor, up: cmdUp, dev: cmdDev, code: cmdCode, down: cmdDown, status: cmdStatus, logs: cmdLogs, jobs: cmdJobs,
  login: cmdLogin, api: cmdApi, shot: cmdShot, open: cmdOpen, pw: cmdPw, trace: cmdTrace,
  rails: cmdRails, sql: cmdSql, db: cmdDb, throttle: cmdThrottle, env: cmdEnv, ios: cmdIos,
  help: () => out(HELP), '--help': () => out(HELP), '-h': () => out(HELP),
};
if (!cmd || !table[cmd]) { out(HELP); process.exit(cmd ? 2 : 0); }
try { await table[cmd](argv); } catch (e) { fail(e?.stack || String(e)); }
