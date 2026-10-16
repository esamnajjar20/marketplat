import { expect, test } from '@playwright/test';

function searchInput(page: import('@playwright/test').Page) {
  return page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('advanced regression contracts', () => {
  test('Arabic search normalization removes tatweel and diacritics without changing ta marbuta', async ({ page }) => {
    await page.goto('/search');
    const input = searchInput(page);
    await input.fill('سَيـّارة');
    await input.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('سيارة');
  });

  test.fixme('clearing a search query preserves unrelated filters but removes pagination', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('هاتف') + '&city=' + encodeURIComponent('غزة') + '&type=ads&page=8');
    await searchInput(page).fill('   ');
    await searchInput(page).press('Enter');
    await expect.poll(() => {
      const params = new URL(page.url()).searchParams;
      return [params.has('q'), params.get('city'), params.get('type'), params.has('page')].join('|');
    }, { timeout: 15_000 }).toBe('false|غزة|ads|false');
  });

  for (const hostile of ['//attacker.example/path', 'https://attacker.example/path', 'javascript:alert(1)', '/\\attacker.example/path']) {
    test(`registration link drops unsafe return destination: ${hostile}`, async ({ page }) => {
      await page.goto('/login?from=' + encodeURIComponent(hostile));
      const link = page.locator('a[href^="/register"]').filter({ hasText: 'إنشاء حساب' }).first();
      await expect(link).toBeVisible({ timeout: 15_000 });
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();
      const target = new URL(href!, page.url());
      expect(target.origin).toBe(new URL(page.url()).origin);
      expect(target.pathname).toBe('/register');
      expect(target.searchParams.has('from')).toBe(false);
    });
  }

  test('offline hub can switch tabs and remains on the same route', async ({ page }) => {
    await page.goto('/offline');
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });
    const readiness = page.getByRole('tab', { name: /جاهزية/ }).first();
    await readiness.click();
    await expect(readiness).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/offline(?:\?.*)?$/);
    await expect(page.getByRole('heading', { name: 'مركز الأوفلاين' })).toBeVisible();
  });
});
