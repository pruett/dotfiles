// verify-suppco pw examples/title.mjs [--as <email>]
export default async ({ page, base }) => {
  await page.goto(base + '/');
  return { url: page.url(), title: await page.title() };
};
