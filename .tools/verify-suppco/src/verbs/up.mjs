// verify-suppco up — see README.md "verify-suppco up --help" for the locked contract.
import https from 'node:https';
import path from 'node:path';
import {
  LOCAL_API_URL, LOCAL_WEB_URL, PORTS, TARGETS, apiHealthy, fail, log, mise, out, parseArgs, paths, resolveRoot,
  oauthSecretFor, sleep, spawnDetached, webEnvFor,
} from '../lib.mjs';
import { clearPort, ensureWebDeps, groupAlive, listeners, mainCheckout, readUp, resolveCheckout, setUp, stopGroup } from '../lib-up.mjs';

const HEALTH_TIMEOUT_MS = 120000;
// Liveness of our own localhost Vite, not a trust check: vite-plugin-mkcert signs with its own CA
// (~/.vite-plugin-mkcert), which `mkcert -CAROOT` / NODE_EXTRA_CA_CERTS may not cover.
const localWebHealthy = () => new Promise((resolve) => {
  const req = https.get(`${LOCAL_WEB_URL}/`, { rejectUnauthorized: false, timeout: 10000 }, (res) => {
    res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 400);
  });
  req.on('timeout', () => { req.destroy(); resolve(false); });
  req.on('error', () => resolve(false));
});
const SERVICES = {
  api: { url: LOCAL_API_URL, healthy: () => apiHealthy(LOCAL_API_URL), health: `${LOCAL_API_URL}/up` },
  web: { url: LOCAL_WEB_URL, healthy: localWebHealthy, health: `${LOCAL_WEB_URL}/` },
};

/** A remote target (staging/prod/url) boots nothing; anything else is `local` or a branch name. */
function remote(which, v) {
  if (/^https?:\/\//.test(v)) return v.replace(/\/+$/, '');
  return v !== 'local' && TARGETS[which][v] ? TARGETS[which][v].url : null;
}

/** Wait until healthy; fail(1) with the log path if the group dies or the timeout passes. */
async function awaitHealth(P, service, rec) {
  const S = SERVICES[service];
  const end = Date.now() + HEALTH_TIMEOUT_MS;
  for (;;) {
    if (await S.healthy()) return;
    if (!groupAlive(rec.pgid)) {
      setUp(P, service, null);
      fail(1, `${service} exited before ${S.health} was healthy; see ${rec.log}`, `tail -n 80 ${rec.log}`);
    }
    if (Date.now() > end) fail(1, `${service} not healthy at ${S.health} after ${HEALTH_TIMEOUT_MS / 1000}s (pgid ${rec.pgid} left running); see ${rec.log}`, `tail -n 80 ${rec.log}`);
    await sleep(1000);
  }
}

export default async function run(argv) {
  const { flags, rest } = parseArgs(argv, { valued: ['web', 'api', 'root'] });
  if (rest.length) fail(2, `unexpected argument '${rest[0]}'`, 'verify-suppco up --help');
  const P = paths(resolveRoot(flags));
  const spec = { api: flags.api || 'local', web: flags.web || 'local' };
  const apiRemote = remote('api', spec.api);
  // What the web dev server talks to: a remote API target, else the local Rails (main clone or branch alike).
  const apiTarget = apiRemote
    ? (TARGETS.api[spec.api] ? { kind: spec.api, name: spec.api, ...TARGETS.api[spec.api] } : { kind: 'url', name: apiRemote, url: apiRemote })
    : { kind: 'local', name: 'local', ...TARGETS.api.local };

  // A local web needs the API target's OAuth secret (exit 2 with the env-file fix); check before stopping or booting anything.
  if (!remote('web', spec.web)) oauthSecretFor(apiTarget);

  // Plan both services before touching anything: checkouts first, so a missing clone exits before any server is stopped.
  const plan = {};
  const state = readUp(P);
  for (const service of ['api', 'web']) {
    const url = remote(service, spec[service]);
    if (url) { plan[service] = { remote: true, url }; continue; }
    mainCheckout(P, service);
    const cwd = resolveCheckout(P, service, spec[service]);
    plan[service] = { checkout: cwd, cwd: service === 'web' ? path.join(cwd, 'apps/web') : cwd, rec: state[service] };
  }

  // Booting Rails against a schema with pending migrations only produces a broken app; refuse up front.
  if (plan.api.cwd) {
    log('checking for pending migrations');
    const r = mise(plan.api.cwd, ['bin/rails', 'db:abort_if_pending_migrations'], { env: { RAILS_ENV: 'development' }, timeoutMs: 180000 });
    if (r.code !== 0) {
      const text = `${r.stdout}\n${r.stderr}`;
      if (/pending migration/i.test(text)) fail(2, `migrations pending in ${plan.api.cwd}`, `cd ${plan.api.cwd} && bin/rails db:migrate`);
      fail(2, `db:abort_if_pending_migrations failed in ${plan.api.cwd}: ${text.trim().split('\n').filter(Boolean).slice(-3).join(' | ')}`, `cd ${plan.api.cwd} && bin/rails db:prepare`);
    }
  }

  // Always a fresh instance: stop the group up recorded last time, then anything else still listening on the port.
  for (const service of ['api', 'web']) {
    const p = plan[service];
    if (p.remote) continue;
    if (p.rec && groupAlive(p.rec.pgid)) { log(`${service} already running (pid ${p.rec.pid}); stopping it`); await stopGroup(p.rec.pgid); }
    if (p.rec) setUp(P, service, null);
    const port = PORTS[service];
    if (listeners(port).length) {
      const pids = await clearPort(port);
      log(`:${port} was held by a server verify-suppco did not start (pid ${pids.join(',')}); stopped it`);
      const left = listeners(port);
      if (left.length) fail(2, `:${port} is still held after stopping pid ${pids.join(',')}`, `kill -9 ${left.map((l) => l.pid).join(' ')}`);
    }
    const logFile = path.join(P.logs, `${service}.log`);
    let cmd;
    let env;
    if (service === 'api') {
      cmd = ['bin/rails', 'server', '-p', String(PORTS.api)];
      env = { RAILS_ENV: 'development' };
    } else {
      ensureWebDeps(p.checkout);
      cmd = ['pnpm', 'exec', 'vite', 'dev', '--port', String(PORTS.web), '--host'];
      env = webEnvFor(apiTarget, { webapp: p.cwd });
    }
    log(`starting ${service}: ${cmd.join(' ')} in ${p.cwd} (log ${logFile})`);
    const child = spawnDetached('mise', ['exec', '-C', p.cwd, '--', ...cmd], { cwd: p.cwd, env, logFile });
    const rec = { pid: child.pid, pgid: child.pid, startedAt: new Date().toISOString(), log: logFile, url: SERVICES[service].url, cwd: p.cwd };
    if (service === 'web') rec.api = apiTarget.name;
    setUp(P, service, rec);
    p.rec = rec;
  }

  // Wait for every local service in parallel.
  await Promise.all(['api', 'web'].filter((s) => !plan[s].remote).map((s) => awaitHealth(P, s, plan[s].rec)));

  for (const service of ['web', 'api']) {
    const p = plan[service];
    out(`${service}: ${p.remote ? p.url : SERVICES[service].url}`);
    if (p.remote) continue;
    out(`${service}_pid: ${p.rec.pid}`);
    out(`${service}_log: ${p.rec.log}`);
  }
  return 0;
}
