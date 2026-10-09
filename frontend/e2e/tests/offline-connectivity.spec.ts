import { expect, test } from '../fixtures/authenticated';

/**
 * Offline lifecycle regression: the hub must react to a real browser context
 * connectivity transition without a reload, then recover when connectivity
 * returns. This is deliberately independent of queued mutations/backend data.
 */
test.describe('offline connectivity lifecycle', () => {
  test('updates the sync hub status on offline → online transitions', async ({ page, context }) => {
    await page.goto('/offline?tab=sync');

    await expect(page.getByText('متصل', { exact: true })).toBeVisible({ timeout: 15_000 });

    await context.setOffline(true);
    await expect(page.getByText('بدون نت', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('أنت غير متصل حالياً', { exact: true })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText('متصل', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
