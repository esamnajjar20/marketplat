import { expect, test } from '@playwright/test';

const publicRoutes = [
  '/',
  '/search',
  '/products',
  '/services',
  '/categories',
  '/stores',
  '/trending',
  '/about',
  '/privacy',
  '/terms',
  '/offline',
];

test.describe('route health and document contracts', () => {
  for (const routePath of publicRoutes) {
    test(`${routePath} renders a document without a server error`, async ({ page }) => {
      const response = await page.goto(routePath, { waitUntil: 'domcontentloaded' });
      expect(response, `No document response for ${routePath}`).not.toBeNull();
      expect(response!.status(), `HTTP status for ${routePath}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      await expect(page).toHaveTitle(/\S+/);
    });
  }

  test('public page document keeps Arabic RTL metadata', async ({ page }) => {
    await page.goto('/products');
    await expect.poll(() => page.locator('html').getAttribute('lang')).toMatch(/^ar(?:-|$)/i);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('navigation between public pages keeps the browser usable', async ({ page }) => {
    await page.goto('/');
    await page.goto('/categories');
    await expect(page.locator('body')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('main').first()).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/categories\/?$/);
    await expect(page.locator('main').first()).toBeVisible();
  });
});
