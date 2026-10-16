import { expect, test } from '@playwright/test';

test.describe('browser history and URL state', () => {
  test('search query survives back and forward navigation', async ({ page }) => {
    await page.goto('/search');
    const searchbox = page.getByRole('searchbox').first();
    await expect(searchbox).toBeVisible();
    await searchbox.fill('اختبار سجل المتصفح');
    await searchbox.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('اختبار سجل المتصفح');

    await page.goto('/about');
    await page.goBack();
    await expect(page).toHaveURL(/\/search(?:\?|$)/);
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 10_000 }).toBe('اختبار سجل المتصفح');
    await page.goForward();
    await expect(page).toHaveURL(/\/about(?:\?|$)/);
  });

  test('direct URL with encoded query renders without server error', async ({ page }) => {
    const response = await page.goto('/search?q=' + encodeURIComponent('سوق + منتجات & خدمات'));
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });
});
