import { expect, test } from '@playwright/test';

test.describe('offline and API failure integration', () => {
  test('offline landing page can be reloaded while offline after service worker control', async ({ page, context }) => {
    try {
      await page.goto('/offline?tab=warming');
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

      // First navigation may install the worker but does not guarantee control.
      // Wait for registration and controller while the network is still online.
      await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) throw new Error('Service Worker unsupported');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Service Worker did not control page')), 20_000);
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.clearTimeout(timer);
              resolve();
            }, { once: true });
          });
        }
        if (!navigator.serviceWorker.controller) throw new Error('Page is not controlled by Service Worker');
      });

      // Ensure the document and its offline fallback have had a chance to be cached.
      await page.waitForTimeout(500);
      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
      } catch {
        // A failed navigation is acceptable only if the already-controlled page
        // still exposes the offline content or the worker's safe fallback.
      }

      const fullHubHeading = page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' });
      const safeFallbackHeading = page.getByRole('heading', { name: 'تعذّر تحميل الصفحة' });
      await expect(fullHubHeading.or(safeFallbackHeading)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('body')).toContainText(/بدون نت|بدون النت|الاتصال ضعيف أو منقطع/);
    } finally {
      // Never leave the browser context offline, even when an assertion fails.
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
    await expect.poll(() => interceptedApiRequests, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText('حدث خطأ أثناء تحميل المنتجات', { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
