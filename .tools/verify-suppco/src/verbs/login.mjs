// verify-suppco login — see README.md "verify-suppco login --help" for the locked contract.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {
  fail, log, out, parseArgs, resolveRoot, paths, resolveTargets, credentials, writeAuth, playwright,
  SESSION_COOKIE, BYPASS_SUFFIX, LOCAL_WEB_URL, LOCAL_API_URL,
} from '../lib.mjs';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
// The web repo's harness stub (apps/web/tests/auth.ts), plus Cloudflare's documented dummy token in the hidden input so
// a backend on the always-pass test keys accepts the form even for emails outside the bypass.
const TURNSTILE_STUB = `window.turnstile = { render: (el, opts) => {
  document.querySelectorAll('input[name="cf-turnstile-response"]').forEach((i) => { i.value = 'XXXX.DUMMY.TOKEN.XXXX'; });
  if (opts && opts.callback) opts.callback('XXXX.DUMMY.TOKEN.XXXX'); return 'mock-widget'; },
  getResponse: () => 'XXXX.DUMMY.TOKEN.XXXX', reset: () => {}, remove: () => {} };`;
// Flash messages the backend renders when it rejects an email or code (backend auth/passwordless_controller.rb).
const REJECTED = /verify that you are human|invalid login code|must be 6 digits|code has expired|no login code found|request a new code|error occurred/i;
const HUMAN_WAIT_MS = 10 * 60 * 1000;

/** Parse argv into { email, code, flags }. Exported for tests; throws CliError(2) on usage errors. */
export function parse(argv) {
  const { flags, rest } = parseArgs(argv, { valued: ['code', 'web', 'api'] });
  if (rest.length > 1) fail(2, `login takes one <email>, got ${rest.length} arguments`, 'verify-suppco login --help');
  const { email, code } = credentials({ email: rest[0], code: flags.code });
  if (!email) fail(2, 'no email given and $VERIFY_SUPPCO_EMAIL unset', `export VERIFY_SUPPCO_EMAIL=<you>${BYPASS_SUFFIX}`);
  return { email, code, flags };
}

/** Is anything answering HTTPS at `url`? Tolerates the mkcert cert even when NODE_EXTRA_CA_CERTS is unset. */
export function answers(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode > 0); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Placeholder Rails credentials: no master.key, but the development.key shim exists. Read-only. */
export const placeholderCredentials = (backend) =>
  !fs.existsSync(path.join(backend, 'config/master.key')) && fs.existsSync(path.join(backend, 'config/credentials/development.key'));

/** The exit-1 { message, fix } for a rejected login. Explains the human-verification flash on a placeholder local backend. */
export function rejection(detail, { apiLocal, P, retry }) {
  if (apiLocal && /verify that you are human/i.test(detail) && placeholderCredentials(P.backend)) {
    const root = P.root.startsWith(os.homedir() + '/') ? `~${P.root.slice(os.homedir().length)}` : P.root;
    return {
      message: 'the login page rejected the email (verify that you are human): the local backend runs on placeholder Rails credentials, so the test@monsterinbox.com bypass is off',
      fix: `printf '%s' '<RAILS_MASTER_KEY from Heroku config or a teammate>' > ${root}/backend/config/master.key && rm -rf ${root}/backend/config/credentials`,
    };
  }
  return { message: `the login page rejected the email or code (${detail})`, fix: retry };
}

const targetFlags = (flags) => ['web', 'api'].filter((k) => flags[k] && flags[k] !== 'local').map((k) => ` --${k} ${flags[k]}`).join('');

export default async function run(argv) {
  const { email, code, flags } = parse(argv);
  const targets = resolveTargets(flags);
  const P = paths(resolveRoot());
  const base = targets.web.url;
  const retry = `verify-suppco login ${email}${targetFlags(flags)}`;

  if (targets.web.kind === 'local' && !(await answers(LOCAL_WEB_URL))) {
    fail(2, `--web local but nothing runs on ${LOCAL_WEB_URL}`, 'verify-suppco up');
  }

  const headless = Boolean(code);
  const { chromium } = playwright(P);
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: base });
    const page = await context.newPage();
    // Headless: stub Turnstile so a bypass account's fixed code goes through unattended. Headed: the real widget
    // loads, because prod's keys reject the dummy token and the human at the keyboard can solve it.
    if (headless) await page.route(TURNSTILE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_STUB }));

    const onWeb = (u) => u.origin === new URL(base).origin && !/^\/(auth|login)(\/|$)/.test(u.pathname);
    const pageSaid = async () => (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
    const rejected = (detail) => {
      // The web server, not --api, decides where the login page lives; diagnose by the page's real origin.
      const apiLocal = new URL(page.url()).origin === new URL(LOCAL_API_URL).origin;
      const { message, fix } = rejection(detail, { apiLocal, P, retry });
      fail(1, message, fix);
    };
    // After a form submit: wait until `done(url)`, failing fast on the backend's error page or a rejection flash.
    const settle = async (done, timeoutMs) => {
      const end = Date.now() + timeoutMs;
      for (;;) {
        await page.waitForLoadState('load').catch(() => {});
        const u = new URL(page.url());
        if (done(u)) return;
        if (/^\/auth\/error/.test(u.pathname)) rejected(`landed on ${u.pathname}${u.search}`);
        if (/^\/auth\//.test(u.pathname)) { const said = await pageSaid(); if (REJECTED.test(said)) rejected(said.match(REJECTED)[0]); }
        if (Date.now() > end) rejected(`stuck at ${u.pathname}: ${await pageSaid()}`);
        await page.waitForTimeout(500);
      }
    };

    log(`login ${email} on web=${targets.web.name} api=${targets.api.name}${headless ? '' : ' (headed)'}`);
    await page.goto('/login?login=true');
    await page.waitForURL('**/auth/login**', { timeout: 30000 })
      .catch(() => fail(1, `never reached the login page (at ${page.url()}); is the api target up?`, 'verify-suppco up'));

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    const submitEmail = () => page.evaluate(() => {
      const i = document.querySelector('input[type="email"], input[name="email"]');
      HTMLFormElement.prototype.submit.call(i.form);
    }).catch(() => {});
    if (headless) await submitEmail();
    else {
      // The real Turnstile must mint a token before the form is worth submitting; submit as soon as it has, unless
      // the human beats us to it (the page is then already on /auth/code).
      log(`solve the human check in the browser window if one appears; submitting the email once it passes`);
      const token = page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value, null, { timeout: HUMAN_WAIT_MS }).then(() => 'token', () => 'timeout');
      const moved = page.waitForURL((u) => /^\/auth\/code/.test(u.pathname), { timeout: HUMAN_WAIT_MS }).then(() => 'moved', () => 'timeout');
      if ((await Promise.race([token, moved])) === 'token') await submitEmail();
    }
    await settle((u) => /^\/auth\/code/.test(u.pathname), headless ? 30000 : HUMAN_WAIT_MS);

    if (headless) {
      const codeInput = page.locator('input[name="code"]').first();
      await codeInput.waitFor({ state: 'visible', timeout: 15000 });
      await codeInput.fill(code);
      await page.evaluate(() => { HTMLFormElement.prototype.submit.call(document.querySelector('input[name="code"]').form); });
      await settle(onWeb, 60000);
    } else {
      log(`type the login code for ${email} in the browser window; waiting up to 10 minutes`);
      await page.waitForURL(onWeb, { timeout: HUMAN_WAIT_MS })
        .catch(() => rejected(`never left ${new URL(page.url()).pathname} within 10 minutes`));
    }

    const session = (await context.cookies()).find((k) => k.name === SESSION_COOKIE);
    if (!session) rejected(`no ${SESSION_COOKIE} cookie after reaching ${new URL(page.url()).pathname}`);
    const savedAt = new Date();
    const expiresAt = session.expires > 0 ? new Date(session.expires * 1000) : new Date(savedAt.getTime() + 3600 * 1000);
    writeAuth(P, {
      email, web: targets.web.name, api: targets.api.name,
      savedAt: savedAt.toISOString(), expiresAt: expiresAt.toISOString(),
      storageState: await context.storageState(),
    });
    out(`email: ${email}`);
    out(`target: web=${targets.web.name} api=${targets.api.name}`);
    out(`expiry: ${expiresAt.toISOString()}`);
    return 0;
  } finally {
    await browser.close();
  }
}
