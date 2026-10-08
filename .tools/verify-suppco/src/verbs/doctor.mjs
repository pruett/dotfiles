// verify-suppco doctor — see README.md "verify-suppco doctor --help" for the locked contract.
import fs from 'node:fs';
import path from 'node:path';
import { BYPASS_SUFFIX, CliError, ENV_FILE, fail, out, parseArgs, paths, playwright, resolveRoot, sh } from '../lib.mjs';
import { REPO } from '../lib-up.mjs';

// mise must report the pinned tool, not download it: doctor is read-only.
const NO_INSTALL = { MISE_EXEC_AUTO_INSTALL: '0', MISE_NOT_FOUND_AUTO_INSTALL: '0', MISE_YES: '0' };
const firstLine = (s) => s.trim().split('\n')[0] || '';
const onPath = (bin) => sh('/bin/sh', ['-c', `command -v ${bin}`]).code === 0;

export default async function run(argv) {
  const { flags, rest } = parseArgs(argv, { valued: ['root'] });
  if (rest.length) fail(2, `unexpected argument '${rest[0]}'`, 'verify-suppco doctor --help');
  const P = paths(resolveRoot(flags));
  const rows = [];
  const add = (status, name, detail, fix) => rows.push({ status, name, detail, fix });

  // checkouts
  const have = {};
  for (const [service, dir] of [['api', P.backend], ['web', P.web]]) {
    const R = REPO[service];
    have[service] = fs.existsSync(path.join(dir, R.marker));
    const branch = have[service] ? firstLine(sh('git', ['-C', dir, 'branch', '--show-current']).stdout) : '';
    add(have[service] ? 'ok' : 'FAIL', `${R.name}/`, have[service] ? `${dir}${branch ? ` @ ${branch}` : ''}` : `${dir} missing ${R.marker}`, `git clone ${R.url} ${dir}`);
  }

  // toolchain pins via mise
  const miseOk = onPath('mise');
  for (const [tool, dir, args] of [['node', P.web, ['node', '-v']], ['pnpm', P.web, ['pnpm', '-v']], ['ruby', P.backend, ['ruby', '-v']]]) {
    const where = path.basename(dir);
    if (!miseOk) { add('FAIL', tool, 'mise not on PATH', 'brew install mise'); continue; }
    if (!fs.existsSync(dir)) { add('FAIL', tool, `no ${where}/ checkout`, `git clone ${REPO[where === 'web' ? 'web' : 'api'].url} ${dir}`); continue; }
    const r = sh('mise', ['exec', '-C', dir, '--', ...args], { cwd: dir, env: NO_INSTALL, timeoutMs: 30000 });
    add(r.code === 0 ? 'ok' : 'FAIL', tool, r.code === 0 ? `${firstLine(r.stdout).replace(/ \(.*$/, '')} (${where})` : `not runnable via mise in ${where}/: ${firstLine(r.stderr)}`, `cd ${dir} && mise install`);
  }

  // rails credentials: without master.key the backend runs on a placeholder shim whose test-email bypass is fake.
  // warn only: everything boots, but a bypass login against --api local is rejected.
  if (have.api) {
    const credFix = `printf '%s' '<RAILS_MASTER_KEY from Heroku config or a teammate>' > ${P.root}/backend/config/master.key && rm -rf ${P.root}/backend/config/credentials`;
    if (fs.existsSync(path.join(P.backend, 'config/master.key'))) add('ok', 'rails credentials', 'real');
    else if (fs.existsSync(path.join(P.backend, 'config/credentials/development.key'))) add('warn', 'rails credentials', `placeholder shim: ${BYPASS_SUFFIX} login against --api local will be rejected`, credFix);
    else add('warn', 'rails credentials', 'none (no master.key, no development.key)', credFix);
  }

  // postgres
  const pgReady = ['pg_isready', ...fs.globSync?.('/opt/homebrew/opt/postgresql@*/bin/pg_isready') ?? []].find((b) => b.includes('/') ? fs.existsSync(b) : onPath(b));
  if (pgReady) {
    const r = sh(pgReady, ['-h', 'localhost'], { timeoutMs: 10000 });
    add(r.code === 0 ? 'ok' : 'FAIL', 'postgres', firstLine(r.stdout) || firstLine(r.stderr) || 'not accepting connections', 'brew services start postgresql@17');
  } else if (onPath('psql')) {
    const r = sh('psql', ['-h', 'localhost', '-d', 'postgres', '-Atc', 'select 1'], { timeoutMs: 10000 });
    add(r.code === 0 ? 'ok' : 'FAIL', 'postgres', r.code === 0 ? 'psql select 1' : firstLine(r.stderr), 'brew services start postgresql@17');
  } else add('FAIL', 'postgres', 'neither pg_isready nor psql on PATH', 'brew install postgresql@17 && brew services start postgresql@17');

  // redis
  if (onPath('redis-cli')) {
    const r = sh('redis-cli', ['-h', '127.0.0.1', 'ping'], { timeoutMs: 5000 });
    const ok = r.stdout.trim() === 'PONG';
    add(ok ? 'ok' : 'FAIL', 'redis', ok ? 'PONG' : (firstLine(r.stdout) || firstLine(r.stderr) || 'no answer'), 'brew services start redis');
  } else add('FAIL', 'redis', 'redis-cli not on PATH', 'brew install redis && brew services start redis');

  // mkcert CA (vite-plugin-mkcert serves https://localhost:3001 with it)
  if (onPath('mkcert')) {
    const ca = path.join(firstLine(sh('mkcert', ['-CAROOT']).stdout), 'rootCA.pem');
    add(fs.existsSync(ca) ? 'ok' : 'FAIL', 'mkcert CA', fs.existsSync(ca) ? ca : `${ca} missing`, 'mkcert -install');
  } else add('FAIL', 'mkcert CA', 'mkcert not on PATH', 'brew install mkcert && mkcert -install');

  // playwright browsers, as resolved from the web checkout
  const pwFix = `cd ${P.webapp} && pnpm exec playwright install chromium`;
  try {
    const exe = playwright(P).chromium.executablePath();
    const ok = exe && fs.existsSync(exe);
    const build = exe?.match(/ms-playwright\/([^/]+)/)?.[1];
    add(ok ? 'ok' : 'FAIL', 'playwright', ok ? `${build || exe}` : `chromium not installed (${exe})`, pwFix);
  } catch (e) {
    add('FAIL', 'playwright', e instanceof CliError ? e.message.split(' (')[0] : String(e.message), e instanceof CliError ? e.fix : pwFix);
  }

  // environment: one line per variable (shell exports win; ENV_FILE is the dotenv fallback). warn only: a human can
  // still type the code, and remote secrets matter only for `up --api prod|staging`.
  const envFile = fs.existsSync(ENV_FILE) ? ((fs.statSync(ENV_FILE).mode & 0o777) === 0o600 ? ENV_FILE : `${ENV_FILE} (not mode 600)`) : 'none';
  add(envFile.endsWith('(not mode 600)') ? 'warn' : 'ok', 'env', `shell exports, then ${envFile}`, `chmod 600 ${ENV_FILE}`);
  const persist = `${process.env.XDG_CONFIG_HOME || `${process.env.HOME}/.config`}/zsh/extras/.zshrc.local.zsh or ${ENV_FILE}`;
  const envVar = (key, { required = true, secret = false, placeholder = '<value>', check } = {}) => {
    const v = process.env[key] || '';
    const bad = v ? check?.(v) : (required ? 'unset' : '');
    add(bad ? 'warn' : 'ok', `$${key}`, bad || (!v ? 'unset (optional)' : secret ? 'set' : v), `echo 'export ${key}=${placeholder}' >> ${persist}`);
  };
  envVar('VERIFY_SUPPCO_ROOT', { required: false, placeholder: '~/work/suppco' });
  envVar('VERIFY_SUPPCO_EMAIL', { placeholder: `<you>${BYPASS_SUFFIX}`, check: (v) => (v.endsWith(BYPASS_SUFFIX) ? '' : `${v} does not end with ${BYPASS_SUFFIX}`) });
  envVar('VERIFY_SUPPCO_CODE', { secret: true, placeholder: '<the bypass code>' });
  envVar('VERIFY_SUPPCO_OAUTH_SECRET_PROD', { secret: true, placeholder: '<secret>' });
  envVar('VERIFY_SUPPCO_OAUTH_SECRET_STAGING', { secret: true, placeholder: '<secret>' });
  envVar('VERIFY_SUPPCO_AUTH_SECRET', { required: false, secret: true, placeholder: '<secret>' });

  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) out(`${r.status.padEnd(4)}  ${r.name.padEnd(w)}  ${r.detail}${r.status !== 'ok' && r.fix ? `  fix: ${r.fix}` : ''}`);
  const failed = rows.filter((r) => r.status === 'FAIL');
  if (failed.length) fail(1, `${failed.length} check${failed.length > 1 ? 's' : ''} failed: ${failed.map((r) => r.name).join(', ')}`, failed[0].fix);
  return 0;
}
