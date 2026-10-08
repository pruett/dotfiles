// Shared by up and down: the up.json record, process-group control, port listeners, checkouts and worktrees.
// up.json: { api: { pid, pgid, startedAt, log, url, cwd }, web: { ..., api: <api target name> } }
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail, log, mise, mkdirp, readJson, sh, sleep, slugify, writeJson } from './lib.mjs';

// ------------------------------------------------------------- up.json --
export const readUp = (P) => readJson(P.upState, {}) || {};
export function writeUp(P, state) {
  if (Object.keys(state).length) writeJson(P.upState, state);
  else fs.rmSync(P.upState, { force: true });
}
/** Read-modify-write one service's entry (null removes it). */
export function setUp(P, service, rec) {
  const s = readUp(P);
  if (rec) s[service] = rec; else delete s[service];
  writeUp(P, s);
}

// ------------------------------------------------------- process groups --
export const groupAlive = (pgid) => { try { process.kill(-pgid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** SIGTERM the group, wait up to graceMs, SIGKILL what is left. Returns 'term' | 'kill' | 'gone'. */
export async function stopGroup(pgid, { graceMs = 10000 } = {}) {
  if (!groupAlive(pgid)) return 'gone';
  try { process.kill(-pgid, 'SIGTERM'); } catch {}
  const end = Date.now() + graceMs;
  while (Date.now() < end) { if (!groupAlive(pgid)) return 'term'; await sleep(250); }
  try { process.kill(-pgid, 'SIGKILL'); } catch {}
  for (let i = 0; i < 20 && groupAlive(pgid); i++) await sleep(100);
  return 'kill';
}

// ------------------------------------------------------------ listeners --
/** Processes listening on <port>: [{ pid, pgid, ppid }]. */
export function listeners(port) {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpg'], { encoding: 'utf8' });
  const found = []; let cur = null;
  for (const line of (r.stdout || '').split('\n')) {
    if (line[0] === 'p') { cur = { pid: Number(line.slice(1)) }; found.push(cur); }
    else if (line[0] === 'g' && cur) cur.pgid = Number(line.slice(1));
  }
  if (found.length) {
    const ps = spawnSync('ps', ['-o', 'pid=,ppid=', '-p', found.map((f) => f.pid).join(',')], { encoding: 'utf8' });
    for (const line of (ps.stdout || '').trim().split('\n')) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      const f = found.find((x) => x.pid === pid); if (f) f.ppid = ppid;
    }
  }
  return found;
}
/** The listener pids worth killing: those whose parent is not itself a listener (puma master, not its workers). */
export const rootPids = (ls) => ls.filter((l) => !ls.some((o) => o.pid === l.ppid)).map((l) => l.pid);
/** Stop every listener on <port>, whoever started it: its process group when it has one of its own, else the pid.
 *  Returns the pids it stopped. */
export async function clearPort(port, { graceMs = 10000 } = {}) {
  const ls = listeners(port);
  if (!ls.length) return [];
  const groups = [...new Set(ls.map((l) => l.pgid).filter((g) => g > 1 && g !== process.pid))];
  await Promise.all(groups.map((g) => stopGroup(g, { graceMs })));
  for (const l of ls) { // anything not covered by a group of its own (pgid 0/1, or a pgid the OS would not let us signal)
    try { process.kill(l.pid, 'SIGKILL'); } catch {}
  }
  for (let i = 0; i < 50 && listeners(port).length; i++) await sleep(100);
  return rootPids(ls);
}

// ------------------------------------------------------------- checkouts --
export const REPO = {
  api: { name: 'backend', marker: 'Gemfile', url: 'git@github.com:SuppleCo/backend.git',
    // Untracked files a fresh worktree needs to boot, copied from the main clone.
    essentials: ['mise.local.toml', '.env', 'config/master.key', 'config/credentials/development.key', 'config/credentials/development.yml.enc'] },
  web: { name: 'web', marker: 'apps/web/package.json', url: 'https://github.com/SuppleCo/web.git',
    essentials: ['mise.local.toml', 'apps/web/.env.local'] },
};
const git = (dir, args, timeoutMs = 120000) => sh('git', ['-C', dir, ...args], { timeoutMs });

function worktrees(main) {
  const list = []; let cur = null;
  for (const line of git(main, ['worktree', 'list', '--porcelain']).stdout.split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; list.push(cur); }
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
  }
  return list;
}

/** `local` → the main clone; `<branch>` → an existing worktree of it, else a new one under .verify-suppco/worktrees. */
/** The main clone of <service>'s repo; fail(2) when it is not there. */
export function mainCheckout(P, service) {
  const R = REPO[service];
  const main = path.join(P.root, R.name);
  if (!fs.existsSync(path.join(main, R.marker))) fail(2, `${R.name} checkout missing: ${main}`, `git clone ${R.url} ${main}`);
  return main;
}

export function resolveCheckout(P, service, spec) {
  const R = REPO[service];
  const main = mainCheckout(P, service);
  if (spec === 'local') return main;
  const existing = worktrees(main).find((w) => w.branch === spec);
  if (existing) {
    if (!fs.existsSync(path.join(existing.path, R.marker))) fail(2, `worktree for ${spec} at ${existing.path} is missing ${R.marker}`, `git -C ${main} worktree prune`);
    return existing.path;
  }
  const dest = path.join(P.state, 'worktrees', `${R.name}-${slugify(spec)}`);
  const hasLocal = git(main, ['show-ref', '--verify', '--quiet', `refs/heads/${spec}`]).code === 0;
  if (!hasLocal) {
    log(`fetching origin/${spec} in ${R.name}`);
    if (git(main, ['fetch', 'origin', spec]).code !== 0) fail(2, `${R.name} has no branch '${spec}' locally or on origin`, `git -C ${main} branch -a`);
  }
  log(`creating ${R.name} worktree for ${spec} at ${dest}`);
  mkdirp(path.dirname(dest));
  const add = hasLocal ? git(main, ['worktree', 'add', dest, spec]) : git(main, ['worktree', 'add', '--track', '-b', spec, dest, `origin/${spec}`]);
  if (add.code !== 0) fail(2, `git worktree add failed: ${add.stderr.trim()}`, `git -C ${main} worktree list`);
  for (const rel of R.essentials) {
    const src = path.join(main, rel), dst = path.join(dest, rel);
    if (fs.existsSync(src) && !fs.existsSync(dst)) { mkdirp(path.dirname(dst)); fs.copyFileSync(src, dst); }
  }
  sh('mise', ['trust', '--quiet', dest]);
  if (fs.existsSync(path.join(dest, 'mise.local.toml'))) sh('mise', ['trust', '--quiet', path.join(dest, 'mise.local.toml')]);
  return dest;
}

/** A web worktree without node_modules gets one `pnpm install`. */
export function ensureWebDeps(dir) {
  if (fs.existsSync(path.join(dir, 'node_modules'))) return;
  log(`pnpm install in ${dir} (no node_modules yet)`);
  const r = mise(dir, ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], { timeoutMs: 15 * 60000 });
  if (r.code !== 0) fail(1, `pnpm install failed in ${dir}: ${(r.stderr || r.stdout).trim().split('\n').slice(-5).join(' | ')}`, `cd ${dir} && pnpm install`);
}
