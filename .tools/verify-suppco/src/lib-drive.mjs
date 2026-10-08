// Shared browser layer for the driving verbs (pw, shot): session resolution, Chromium launch, run directory, run.json.
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fail, log, warn, readAuth, newRunDir, playwright, writeJson, mkdirp, credentials, CLI_DIR } from './lib.mjs';

/** The session to inject: --as, else $PLAYWRIGHT_EMAIL, else '' (guest). */
export const resolveAs = (flags) => flags.as || credentials().email || '';

/** The saved session for `email` (exit 2 when missing), or null for guest. Returned twice: with and without storageState. */
export function loadSession(P, email) {
  if (!email) return { storageState: undefined, auth: null };
  const { storageState, ...auth } = readAuth(P, email);
  return { storageState, auth };
}

/** `WxH` → { width, height }; anything else exits 2. */
export function parseViewport(v, verb) {
  if (v === undefined) return { width: 1280, height: 900 };
  const m = /^(\d+)x(\d+)$/.exec(v);
  if (!m) fail(2, `--viewport must be <W>x<H>, got '${v}'`, `verify-suppco ${verb} --help`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** Status of a URL, ignoring TLS validity (the local mkcert cert may not be in Node's store). 0 when unreachable. */
export function probe(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode || 0); });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}

/** --web local but nothing answers → exit 2 (fix: verify-suppco up). */
export async function requireWeb(targets) {
  if (targets.web.kind !== 'local') return;
  if (!(await probe(targets.web.url))) fail(2, `nothing answers on ${targets.web.url}`, 'verify-suppco up');
}

/** Playwright for a drive. A remote --web never touches the checkouts: it resolves from this CLI dir only. */
export function drivePlaywright(P, targets) {
  if (targets.web.kind === 'local') return playwright(P);
  try { return createRequire(path.join(CLI_DIR, 'package.json'))('@playwright/test'); } catch (e) {
    fail(2, `Playwright not found in ${CLI_DIR}/node_modules (${e.message.split('\n')[0]})`, `cd ${CLI_DIR} && pnpm install && pnpm exec playwright install chromium`);
  }
}

/**
 * Launch Chromium and open one page against the web target, inside a fresh run directory.
 * Returns { browser, context, page, runDir, artifacts, finish(exitCode) }. finish() stops the trace, closes the browser,
 * names the video, and writes run.json; call it exactly once, on success and failure alike.
 */
export async function openDrive({ P, verb, slug, argv, targets, as, storageState, headed = false, trace = false, video = false, viewport }) {
  const { chromium } = drivePlaywright(P, targets);
  const runDir = newRunDir(P, verb, slug);
  log(`run: ${runDir}`);
  const startedAt = new Date().toISOString();
  const artifacts = [];
  const videoTmp = path.join(runDir, '.video');
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: targets.web.url,
    storageState,
    viewport: viewport || { width: 1280, height: 900 },
    ...(video ? { recordVideo: { dir: videoTmp, size: viewport || { width: 1280, height: 900 } } } : {}),
  });
  if (trace) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();

  let finished = false;
  async function finish(exitCode) {
    if (finished) return;
    finished = true;
    if (trace) {
      const file = path.join(runDir, 'trace.zip');
      try { await context.tracing.stop({ path: file }); artifacts.push(file); log(`trace: ${file}`); } catch (e) { warn(`trace not saved: ${e.message}`); }
    }
    const rawVideo = video ? await page.video()?.path().catch(() => null) : null;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (rawVideo && fs.existsSync(rawVideo)) {
      const file = path.join(runDir, 'video.webm');
      fs.renameSync(rawVideo, file);
      artifacts.push(file);
      log(`video: ${file}`);
    }
    fs.rmSync(videoTmp, { recursive: true, force: true });
    writeJson(path.join(runDir, 'run.json'), {
      verb, argv, startedAt, finishedAt: new Date().toISOString(), exitCode,
      target: { web: targets.web.url, api: targets.api.url }, as: as || null,
      artifacts: [...new Set(artifacts)].map((f) => path.relative(runDir, f)),
    });
  }

  return { browser, context, page, runDir, artifacts, finish };
}

/** shots(name) for a pw script: saves shots/<name>.png in the run directory, returns its absolute path. */
export function shotsFn(page, runDir, artifacts) {
  return async (name, opts = {}) => {
    const file = path.join(runDir, 'shots', `${String(name).replace(/[^a-zA-Z0-9._-]+/g, '-')}.png`);
    mkdirp(path.dirname(file));
    await page.screenshot({ ...opts, path: file });
    artifacts.push(file);
    return file;
  };
}

// ---------------------------------------------------------- error pages --
// Conservative: only the shapes SuppCo's +error.svelte and generic error pages produce. The home page must pass.
const ERROR_TITLE = /^(oops\b|unauthorized\b|forbidden\b|connection issue\b)|something went wrong|not found|\berror\b/i;
const ERROR_HEADING = /^(oops\b|unauthorized\b|forbidden\b|something went wrong|error:|internal (server )?error\b|(404|500|502|503)\b)|not found$/i;
export const AUTH_ERROR = /^unauthorized\b|^forbidden\b/i;

/** Why this looks like an error page, or null. `headings` are the visible h1/h2 texts of the main content. */
export function errorPageReason({ title = '', headings = [] } = {}) {
  const t = title.trim();
  if (ERROR_TITLE.test(t)) return `title '${t}'`;
  const h = headings.map((s) => s.trim().replace(/\s+/g, ' ')).find((s) => ERROR_HEADING.test(s));
  return h ? `heading '${h.slice(0, 120)}'` : null;
}

/** Visible h1/h2 texts outside header/nav/footer/aside. */
export const mainHeadings = (page) => page.$$eval('h1, h2', (els) => els
  .filter((el) => el.getClientRects().length && !el.closest('header, nav, footer, aside') && getComputedStyle(el).visibility !== 'hidden')
  .map((el) => el.innerText || el.textContent || '')).catch(() => []);
