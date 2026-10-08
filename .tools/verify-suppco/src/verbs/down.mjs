// verify-suppco down — the contract is HELP.down in ../help.mjs (`verify-suppco down --help`).
import { fail, log, out, parseArgs, paths, resolveRoot } from '../lib.mjs';
import { readUp, setUp, stopGroup } from '../lib-up.mjs';

export default async function run(argv) {
  // --root is accepted (like every verb that reads .verify-suppco/) but not advertised; $VERIFY_SUPPCO_ROOT works too.
  const { flags, rest } = parseArgs(argv, { valued: ['root'] });
  if (rest.length) fail(2, `unexpected argument '${rest[0]}'`, 'verify-suppco down --help');
  const P = paths(resolveRoot(flags));
  const state = readUp(P);
  let stopped = 0;
  // Only the process groups recorded in up.json: never by name or port.
  await Promise.all(Object.entries(state).map(async ([service, rec]) => {
    const how = rec?.pgid ? await stopGroup(rec.pgid) : 'gone';
    setUp(P, service, null);
    if (how === 'gone') return;
    stopped++;
    out(`${service}: stopped pgid ${rec.pgid}${how === 'kill' ? ' (SIGKILL after 10s)' : ''}  ${rec.url}`);
  }));
  if (!stopped) log('nothing running');
  return 0;
}
