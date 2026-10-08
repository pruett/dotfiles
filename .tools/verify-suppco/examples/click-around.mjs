// verify-suppco pw examples/click-around.mjs --as <email>
const LIMIT = 4;
const PREFER = ['/my/', '/health-research', '/products', '/brands', '/home'];
const rank = (h) => { const i = PREFER.findIndex((p) => h.startsWith(p)); return i < 0 ? PREFER.length : i; };
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

export default async ({ page, base, shots }) => {
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(base + '/home/today');
  await settle(page);
  const path0 = new URL(page.url()).pathname;
  if (/^\/(auth|login)(\/|$)/.test(path0)) throw new Error(`not logged in: landed on ${path0}`);
  await shots('home');

  const hrefs = await page.$$eval('nav a[href]', (as) => as.map((a) => a.getAttribute('href')));
  const targets = [...new Set(hrefs)]
    .filter((h) => h && h.startsWith('/') && !h.startsWith('//') && !/log-?out|sign-?out/i.test(h))
    .filter((h) => h !== path0)
    .map((h, i) => ({ h, i }))
    .sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i)
    .map(({ h }) => h)
    .slice(0, LIMIT);

  const visited = [];
  for (const href of targets) {
    try {
      await page.goto(base + '/home/today');
      await settle(page);
      const link = page.locator(`nav a[href="${href}"]`).first();
      if (!(await link.count()) || !(await link.isVisible())) continue;
      await link.click({ timeout: 5000 });
      await settle(page);
      const slug = href.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-') || 'root';
      await shots(slug);
      const finalUrl = page.url();
      const want = new URL(href, base).pathname.replace(/\/+$/, '');
      const got = new URL(finalUrl).pathname.replace(/\/+$/, '');
      const entry = { href, finalUrl, title: await page.title() };
      if (got !== want) entry.redirected = true; // e.g. a drawer/search trigger that did not navigate
      visited.push(entry);
    } catch { /* skip links that cannot be clicked */ }
  }
  return { visited, consoleErrors };
};
