import { expect, test } from '@playwright/test';

const queryRoutes = [
  '/search?q=' + encodeURIComponent('سيارة مستعملة'),
  '/products?page=1',
  '/services?sort=recent',
  '/categories?sort=name',
  '/stores?page=1',
  '/requests?q=' + encodeURIComponent('مساعدة'),
];

test.describe('route query resilience and not-found recovery', () => {
  test('common query strings do not produce server errors', async ({ page }) => {
    for (const routePath of queryRoutes) {
      const response = await page.goto(routePath, { waitUntil: 'domcontentloaded' });
      expect(response, `No document response for ${routePath}`).not.toBeNull();
      expect(response!.status(), `${routePath} returned ${response!.status()}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('an unknown public route offers working home and search destinations', async ({ page }) => {
    await page.goto('/e2e-unknown-public-route-94731');
    await expect(page.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'العودة للرئيسية' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'البحث في المنصة' })).toHaveAttribute('href', '/search');
  });

  test('query parameter values do not become executable markup', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('[onerror]')).toHaveCount(0);
  });
});
