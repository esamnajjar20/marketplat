import { expect, test } from '@playwright/test';

test.describe('offline and API failure integration', () => {
  test('offline landing page can be reloaded while offline after service worker control', async ({ page, context }) => {
    await page.goto('/offline');
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return;
      await navigator.serviceWorker.ready;
    });
    await expect(page.locator('body')).toBeVisible();
    try {
      await page.evaluate(() => new Promise<void>((resolve) => {
        if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller) return resolve();
        const timeout = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
      }));
      const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
      test.skip(!controlled, 'Service worker is not controlling this browser session');

      // The worker's install handler pre-caches /offline and its document assets.
      // Wait for that cache contract explicitly before cutting the network; otherwise
      // the test can reload in the small interval between controllerchange and cache
      // population on slower CI runners.
      await expect.poll(
        () => page.evaluate(async () => Boolean(await caches.match(new URL('/offline', location.origin).href))),
        { timeout: 10_000 },
      ).toBe(true);

      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
      await page.reload();
      const offlineHeading = { name: 'جاهزية التطبيق بدون نت' };
      await expect(page.getByRole('heading', { name: offlineHeading.name })).toBeVisible();
      await expect(page.locator('body')).toContainText('بدون نت');
    } finally {
      await context.setOffline(false);
    }
  });

  test('the products listing exposes its error state when its API request fails', async ({ page }) => {
    let interceptedApiRequests = 0;
    await page.route('**/api/**', async (route) => {
      interceptedApiRequests += 1;
      await route.abort('failed');
    });
    await page.goto('/products');
    await expect.poll(() => interceptedApiRequests, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByText('حدث خطأ أثناء تحميل المنتجات', { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
