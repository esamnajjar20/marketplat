import { expect, test } from '@playwright/test';

async function readOnlineState(page: import('@playwright/test').Page): Promise<boolean | null> {
  // Chromium can replace the document while its offline/online events are
  // delivered. Treat that short navigation window as a retryable state.
  try {
    return await page.evaluate(() => navigator.onLine);
  } catch {
    return null;
  }
}

test('offline center remains usable across real browser network transitions', async ({ page, context }) => {
  await page.goto('/offline');
  await expect(page.locator('body')).toBeVisible();
  // The hub starts on the saved-items tab; readiness content is rendered
  // only after explicitly selecting its tab.
  const readinessTab = page.getByRole('tab', { name: /جاهزية/ }).first();
  await expect(readinessTab).toBeVisible();
  await readinessTab.click();
  await expect(readinessTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();

  try {
    await context.setOffline(true);
    await expect.poll(() => readOnlineState(page), { timeout: 10_000 }).toBe(false);
    // The public offline hub does not mount the global NetworkStatusBanner
    // (that banner is currently rendered by the admin monitoring page). Assert
    // the actual public-page contract instead of waiting for an absent banner.
    await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();
    await expect(page.locator('body')).toContainText('بدون نت');
  } finally {
    await context.setOffline(false);
  }

  await expect.poll(() => readOnlineState(page), { timeout: 10_000 }).toBe(true);
  await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();
});
