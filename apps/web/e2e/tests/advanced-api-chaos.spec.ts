import { expect, test } from '@playwright/test';

const listingRoutes = ['/ads', '/products', '/services', '/stores', '/requests'];

test.describe('API failure containment', () => {
  for (const route of listingRoutes) {
    test(`${route} keeps its document usable when API calls fail`, async ({ page }) => {
      await page.route('**/api/**', (requestRoute) => requestRoute.abort('failed'));
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response, `No document response for ${route}`).not.toBeNull();
      expect(response!.status(), `Document failed for ${route}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }

  test('slow API responses do not prevent the initial search document from rendering', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    const response = await page.goto('/search', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'البحث' })).toBeAttached();
  });

  test('a single API request abort does not turn the browser into a blank page', async ({ page }) => {
    let aborted = false;
    await page.route('**/api/**', async (route) => {
      if (!aborted) {
        aborted = true;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await expect.poll(() => page.locator('body').evaluate((el) => (el.textContent ?? '').trim().length)).toBeGreaterThan(0);
  });
});
