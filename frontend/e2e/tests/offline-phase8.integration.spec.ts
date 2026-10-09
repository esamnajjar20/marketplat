import { test, expect } from '@playwright/test';

/**
 * Phase 8 — browser-level offline integration.
 *
 * This intentionally uses the real service worker and real Next.js app (no
 * page.route mocks). Run against a production build so the service worker and
 * its precache/navigation strategies match deployment behavior.
 */
test.describe('offline phase 8 integration', () => {
  test('cached offline hub survives a hard reload without network and recovers online', async ({ page, context }) => {
    await page.goto('/offline?tab=warming');
    await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();

    // Wait for registration, then reload once so the page is controlled by the
    // active worker before we deliberately remove the network.
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unsupported');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();
    const controlledByServiceWorker = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    expect(controlledByServiceWorker, 'the offline page must be controlled before testing cached reload').toBe(true);

    try {
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('بدون نت', { exact: true })).toBeVisible({ timeout: 10_000 });
    } finally {
      // Always restore connectivity so teardown and following tests are not
      // accidentally left in offline mode if an assertion fails.
      await context.setOffline(false);
    }

    await expect(page.getByText('متصل', { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('the offline hub renders a useful local surface when optional API calls fail', async ({ page }) => {
    await page.goto('/offline?tab=warming');
    await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();

    // Browser integration check: simulate an unavailable API after the page
    // is rendered, without blocking the app shell or its local controls.
    await page.route('**/api/**', async (route) => {
      await route.abort('failed');
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible({ timeout: 15_000 });
  });
});
