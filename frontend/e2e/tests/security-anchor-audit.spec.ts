import { expect, test } from '@playwright/test';

test('rendered public links do not use executable javascript URLs', async ({ page }) => {
  for (const route of ['/', '/search', '/login', '/register']) {
    await page.goto(route);
    const unsafe = await page.locator('a[href]').evaluateAll(anchors => anchors
      .map(anchor => (anchor as HTMLAnchorElement).getAttribute('href') || '')
      .filter(href => /^\s*javascript\s*:/i.test(href)));
    expect(unsafe, `Unsafe anchor href on ${route}`).toEqual([]);
  }
});

test('external anchors declare a safe relationship when opening a new tab', async ({ page }) => {
  await page.goto('/');
  const unsafe = await page.locator('a[target="_blank"][href]').evaluateAll(anchors => anchors
    .filter(anchor => {
      const rel = (anchor.getAttribute('rel') || '').toLowerCase().split(/\s+/);
      return !rel.includes('noopener') && !rel.includes('noreferrer');
    })
    .map(anchor => (anchor as HTMLAnchorElement).href));
  expect(unsafe, 'New-tab links should prevent opener access').toEqual([]);
});
