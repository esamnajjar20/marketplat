import { expect, test } from '@playwright/test';

test.describe('network failure recovery contracts', () => {
  test('a failed product API request does not turn the whole document into a server error', async ({ page }) => {
    let intercepted = false;
    await page.route('**/api/**', async (route) => {
      intercepted = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'temporary outage' }) });
    });
    const response = await page.goto('/products', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect.poll(() => intercepted, { timeout: 10_000 }).toBe(true);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('browser offline and online transitions do not destroy the current route', async ({ page, context }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();
    await expect(page).toHaveURL(/\/offline(?:\?.*)?$/);
  });
});
