import { expect, test } from '@playwright/test';

const browseRoutes = ['/products', '/services', '/categories', '/stores'];

test.describe('browse pages under API failures', () => {
  for (const routePath of browseRoutes) {
    test(`${routePath} keeps a usable document when API requests fail`, async ({ page }) => {
      let failedRequests = 0;
      await page.route('**/api/**', async (route) => {
        failedRequests += 1;
        await route.abort('failed');
      });

      const response = await page.goto(routePath, { waitUntil: 'domcontentloaded' });
      expect(response, `Expected a document response for ${routePath}`).not.toBeNull();
      expect(response!.status(), `${routePath} should not return a 5xx document`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();
      // A page can legitimately render from cache without requesting the API;
      // only require interception on routes known to fetch live data.
      if (routePath === '/products' || routePath === '/services') {
        await expect.poll(() => failedRequests, { timeout: 10_000 }).toBeGreaterThan(0);
      }
    });
  }

  test('the products listing shows its API error state instead of hanging forever', async ({ page }) => {
    let failedRequests = 0;
    await page.route('**/api/**', async (route) => {
      failedRequests += 1;
      await route.abort('failed');
    });
    await page.goto('/products');
    await expect.poll(() => failedRequests, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByText('حدث خطأ أثناء تحميل المنتجات', { exact: false })).toBeVisible({ timeout: 15_000 });
  });

  test('a failed API response does not turn the search document into a server error', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    const response = await page.goto('/search?q=' + encodeURIComponent('كرسي'));
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toBeVisible();
  });
});
