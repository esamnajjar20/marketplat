import { expect, test } from '@playwright/test';

const publicRoutes = [
  '/', '/search', '/ads', '/products', '/services', '/categories',
  '/stores', '/requests', '/about', '/contact', '/privacy', '/terms',
  '/promoted', '/trending', '/for-you', '/sellers/ranking',
];

test.describe('advanced public route contracts', () => {
  for (const route of publicRoutes) {
    test(`${route} remains usable after a hard reload`, async ({ page }) => {
      const first = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(first, `Missing response for ${route}`).not.toBeNull();
      expect(first!.status(), `${route} returned ${first!.status()}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }

  test('public pages expose a document title and language metadata', async ({ page }) => {
    for (const route of ['/', '/search', '/products', '/categories']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle(/\S/);
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang, `Missing html lang on ${route}`).toBeTruthy();
    }
  });

  test('not-found route offers a recovery path without a server error', async ({ page }) => {
    const response = await page.goto('/e2e-route-that-does-not-exist-9f2a', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('link', { name: /الرئيسية|البحث|عودة|العودة/i }).first()).toBeVisible();
  });
});
