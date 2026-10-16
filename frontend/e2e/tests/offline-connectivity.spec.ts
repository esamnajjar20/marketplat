import { expect, test } from '@playwright/test';

test('offline center reports connectivity changes and restores the browser network', async ({ page, context }) => {
  await page.goto('/offline');
  await expect(page.locator('body')).toBeVisible();
  const connectionStatus = page.locator('[role="status"]');

  try {
    await context.setOffline(true);
    // Chromium emits the real offline event when the context changes network state.
    // Dispatching a second synthetic event can race with that browser event.
    await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
    await expect(connectionStatus).toContainText(/غير متصل|بدون نت|أوفلاين/i, { timeout: 10_000 });
  } finally {
    await context.setOffline(false);
  }

  // Wait for Chromium to restore the network before emitting a deterministic event
  // for the app's shared lifecycle subscriber. This avoids a late offline event
  // overwriting the synthetic online transition in CI.
  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(connectionStatus).toContainText('متصل', { timeout: 10_000 });
});
