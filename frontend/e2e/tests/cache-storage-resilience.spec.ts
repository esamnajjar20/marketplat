import { expect, test } from '@playwright/test';

test.describe('client storage and page lifecycle resilience', () => {
  test('search route remains usable when recent-search storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new DOMException('Storage is unavailable', 'SecurityError'); },
        });
      } catch {
        // If the browser disallows overriding the property, the normal storage
        // contract is still covered by the other search tests.
      }
    });
    const response = await page.goto('/search', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    const input = page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
    await expect(input).toBeVisible();
    await input.fill('بحث دون تخزين');
    await input.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('بحث دون تخزين');
  });

  test('reload preserves a query encoded in the URL', async ({ page }) => {
    const query = 'كاميرا 4K & عدسة';
    await page.goto('/search?q=' + encodeURIComponent(query));
    const input = page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
    await expect(input).toHaveValue(query);
    await page.reload();
    await expect(input).toHaveValue(query);
    expect(new URL(page.url()).searchParams.get('q')).toBe(query);
  });
});
