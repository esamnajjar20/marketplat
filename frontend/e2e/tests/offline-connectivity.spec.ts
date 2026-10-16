import { expect, test } from '@playwright/test';

test('offline center reports connectivity changes and restores the browser network', async ({ page, context }) => {
  await page.goto('/offline');
  await expect(page.locator('body')).toBeVisible();

  const offlineStatus = page.getByRole('status').filter({ hasText: /لا يوجد اتصال بالإنترنت|غير متصل/ }).first();
  const onlineStatus = page.getByRole('status').filter({ hasText: 'عاد الاتصال' }).first();

  try {
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
    // Keep the browser's network state authoritative, while ensuring the app's
    // shared lifecycle subscriber observes the same transition in CI.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(offlineStatus).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.setOffline(false);
  }

  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(onlineStatus).toBeVisible({ timeout: 10_000 });
});
