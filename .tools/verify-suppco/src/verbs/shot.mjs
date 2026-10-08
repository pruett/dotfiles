// verify-suppco shot — see README.md "verify-suppco shot --help" for the locked contract.
import path from 'node:path';
import { fail, out, log, warn, parseArgs, resolveRoot, paths, resolveTargets, writeJson } from '../lib.mjs';
import { resolveAs, loadSession, requireWeb, openDrive, parseViewport, errorPageReason, mainHeadings, AUTH_ERROR } from '../lib-drive.mjs';

export default async function run(argv, ctx) {
  const { flags, rest } = parseArgs(argv, { valued: ['as', 'web', 'api', 'viewport', 'selector'], boolean: ['full'] });
  if (rest.length !== 1) fail(2, rest.length ? `shot takes one route, got ${rest.length}` : 'missing <route>', 'verify-suppco shot --help');
  const route = rest[0];
  const viewport = parseViewport(flags.viewport, 'shot');

  const P = paths(resolveRoot());
  const targets = resolveTargets(flags);
  const as = resolveAs(flags);
  const { storageState, auth } = loadSession(P, as);
  if (auth?.web && auth.web !== targets.web.name) warn(`session for ${as} was saved against --web ${auth.web}, shooting ${targets.web.name}`);
  await requireWeb(targets);

  const url = /^https?:\/\//.test(route) ? route : `${targets.web.url}${route.startsWith('/') ? '' : '/'}${route}`;
  const d = await openDrive({ P, verb: 'shot', slug: route, argv, targets, as, storageState, viewport });
  const { page, runDir } = d;

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 1000)); });
  page.on('pageerror', (e) => consoleErrors.push(String(e?.message || e).slice(0, 1000)));
  page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText || 'failed' }));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() }); });

  let report;
  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    } catch (e) {
      fail(1, `could not load ${url}: ${e.message.split('\n')[0]}`, `verify-suppco shot ${route}${as ? ` --as ${as}` : ''}`);
    }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => warn('network never went idle within 15s; shooting after load'));
    if (flags.selector) {
      await page.waitForSelector(flags.selector, { timeout: 15000 }).catch(() => {
        fail(1, `selector '${flags.selector}' never appeared on ${route}`, `verify-suppco shot ${route}${as ? ` --as ${as}` : ''}`);
      });
    }

    const shotFile = path.join(runDir, 'shot.png');
    await page.screenshot({ path: shotFile, fullPage: !!flags.full });
    d.artifacts.push(shotFile);

    const finalUrl = page.url();
    const wanted = new URL(url);
    const title = await page.title().catch(() => '');
    const headings = await mainHeadings(page);
    const status = response ? response.status() : null;
    const errorReason = errorPageReason({ title, headings });
    report = {
      route, finalUrl,
      redirected: new URL(finalUrl).pathname.replace(/\/+$/, '') !== wanted.pathname.replace(/\/+$/, ''),
      status, title, errorPage: !!errorReason,
      consoleErrors: [...consoleErrors], failedRequests: [...failedRequests],
    };
    const jsonFile = path.join(runDir, 'shot.json');
    writeJson(jsonFile, report);
    d.artifacts.push(jsonFile);

    if ((status ?? 0) >= 400 || errorReason) {
      const why = (status ?? 0) >= 400 ? `status ${status}` : `error page rendered (${errorReason})`;
      const fix = !as ? `verify-suppco shot ${route} --as <email>`
        : status === 401 || status === 403 || AUTH_ERROR.test(title) || headings.some((h) => AUTH_ERROR.test(h.trim())) ? `verify-suppco login ${as}`
        : `verify-suppco shot ${route} --as ${as} --full`;
      fail(1, `${route}: ${why}; see ${runDir}`, fix);
    }
  } catch (e) {
    await d.finish(e?.code === 2 ? 2 : 1);
    throw e;
  }
  await d.finish(0);
  if (report.redirected) log(`redirected to ${report.finalUrl}`);
  if (report.consoleErrors.length || report.failedRequests.length) warn(`${report.consoleErrors.length} console errors, ${report.failedRequests.length} failed requests (shot.json)`);
  out(runDir);
  return 0;
}
