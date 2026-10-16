import { expect, test } from '@playwright/test';

test('offline center reports connectivity changes and restores the browser network', async ({ page, context }) => {
  await page.goto('/offline');
  await expect(page.locator('body')).toBeVisible();
  try {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/غير متصل|بدون نت|أوفلاين/i).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.setOffline(false);
  }
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('متصل', { exact: true })).toBeVisible({ timeout: 10_000 });
});
