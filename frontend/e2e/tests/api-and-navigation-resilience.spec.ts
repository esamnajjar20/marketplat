import { expect, test } from '@playwright/test';

const routes = ['/products', '/services', '/ads', '/categories', '/stores', '/requests'];

test.describe('API and navigation resilience', () => {
  for (const route of routes) {
    test(`${route} document remains usable when the page is opened directly`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
    });
  }

  test('products page remains a document when API requests abort', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    const response = await page.goto('/products', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('unknown route offers a recovery path instead of an empty document', async ({ page }) => {
    const response = await page.goto('/e2e-route-that-does-not-exist');
    expect(response).not.toBeNull();
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('heading', { name: /الصفحة غير موجودة/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /العودة للرئيسية/ })).toHaveAttribute('href', '/');
  });

  test('offline hub can open its guest-safe readiness tab from a URL', async ({ page }) => {
    await page.goto('/offline?tab=warming');
    await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /جاهزية/ }).first()).toHaveAttribute('aria-selected', 'true');
  });
});
