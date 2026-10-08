// verify-suppco pw — see README.md "verify-suppco pw --help" for the locked contract.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, out, warn, parseArgs, resolveRoot, paths, resolveTargets } from '../lib.mjs';
import { resolveAs, loadSession, requireWeb, openDrive, shotsFn } from '../lib-drive.mjs';

export default async function run(argv, ctx) {
  const { flags, rest, passthrough } = parseArgs(argv, { valued: ['as', 'web', 'api'], boolean: ['headed', 'trace', 'video'] });
  if (rest.length !== 1) fail(2, rest.length ? `pw takes one script, got ${rest.length}` : 'missing <script.mjs>', 'verify-suppco pw --help');
  const script = path.resolve(process.env.VERIFY_SUPPCO_CWD || process.cwd(), rest[0]);
  if (!fs.existsSync(script) || !fs.statSync(script).isFile()) fail(2, `script not found: ${script}`, 'verify-suppco pw --help');

  const P = paths(resolveRoot());
  const targets = resolveTargets(flags);
  const as = resolveAs(flags);
  const { storageState, auth } = loadSession(P, as);
  if (auth?.web && auth.web !== targets.web.name) warn(`session for ${as} was saved against --web ${auth.web}, running against ${targets.web.name}`);
  await requireWeb(targets);

  const mod = await import(pathToFileURL(script).href).catch((e) => {
    console.error(e?.stack || e);
    fail(1, `could not import ${rest[0]}: ${e?.message || e}`, `node --check ${script}`);
  });
  if (typeof mod.default !== 'function') fail(2, `${rest[0]} has no default export function`, 'verify-suppco pw --help');

  const slug = path.basename(script).replace(/\.[^.]+$/, '');
  const d = await openDrive({ P, verb: 'pw', slug, argv, targets, as, storageState, headed: !!flags.headed, trace: !!flags.trace, video: !!flags.video });
  let result;
  try {
    result = await mod.default({ page: d.page, context: d.context, base: targets.web.url, auth, args: passthrough, shots: shotsFn(d.page, d.runDir, d.artifacts) });
  } catch (e) {
    await d.finish(1);
    if (e?.stack) console.error(e.stack);
    const fix = ['verify-suppco pw', rest[0], ...(flags.as ? ['--as', flags.as] : []), ...(flags.web ? ['--web', flags.web] : []), ...(flags.api ? ['--api', flags.api] : []), '--trace --headed'];
    fail(1, `script threw: ${e?.message || e}`, fix.join(' '));
  }
  await d.finish(0);
  if (result !== undefined) out(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  return 0;
}
