import { expect, test } from '../fixtures/authenticated';

/**
 * Phase 44: exercise the local-first offline hub as a user would.
 * The page is loaded and controlled while online first; after that, tab
 * navigation must stay client-side while the browser context is offline.
 */
test.describe('offline hub resilience', () => {
  test('keeps local tabs usable offline and recovers the connection status', async ({ page, context }) => {
    await page.goto('/offline?tab=sync');
    await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();
    await expect(page.getByText('متصل', { exact: true })).toBeVisible({ timeout: 15_000 });

    // Ensure the route has a controlling worker before network emulation.
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unsupported');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();

    const controllerReady = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    expect(controllerReady, 'offline hub should be controlled before offline tab checks').toBe(true);

    try {
      await context.setOffline(true);
      await expect(page.getByText('بدون نت', { exact: true })).toBeVisible({ timeout: 10_000 });

      const draftsTab = page.getByRole('tab', { name: /مسودات/ });
      await draftsTab.click();
      await expect(draftsTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('heading', { name: 'مسوداتك على هذا الجهاز' })).toBeVisible();

      const savedTab = page.getByRole('tab', { name: /محفوظاتي|محفوظات/ });
      await savedTab.click();
      await expect(savedTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('heading', { name: 'المحفوظات المتاحة دون اتصال' })).toBeVisible();

      // Tab changes are local state changes and should not force a document navigation.
      await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }

    const syncTab = page.getByRole('tab', { name: /المزامنة|مزامنة/ });
    await syncTab.click();
    await expect(syncTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('متصل', { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
