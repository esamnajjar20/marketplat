import { expect, test } from '@playwright/test';

test('public search remains usable when sessionStorage access throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
    });
  });
  const response = await page.goto('/search');
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByRole('searchbox').first()).toBeVisible();
});
