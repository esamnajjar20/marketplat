import { expect, test } from '@playwright/test';

function searchInput(page: import('@playwright/test').Page) {
  return page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('E2E hardening regression contracts', () => {
  test('keyboard submit uses the latest typed query, not a stale suggestion', async ({ page }) => {
    await page.goto('/search');
    const input = searchInput(page);
    await input.focus();
    await input.fill('استعلام جديد بلوحة المفاتيح');
    await input.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('استعلام جديد بلوحة المفاتيح');
  });

  test('clearing query keeps unrelated filters and removes page cursor', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('إعلان قديم') + '&city=' + encodeURIComponent('غزة') + '&type=ads&page=12');
    const input = searchInput(page);
    await expect(input).toBeVisible();
    await input.fill('   ');
    await input.press('Enter');
    await expect.poll(() => {
      const params = new URL(page.url()).searchParams;
      return JSON.stringify({ q: params.has('q'), city: params.get('city'), type: params.get('type'), page: params.has('page') });
    }, { timeout: 15_000 }).toBe(JSON.stringify({ q: false, city: 'غزة', type: 'ads', page: false }));
  });

  test('malformed percent encoding in auth return destination never crashes login', async ({ page }) => {
    const response = await page.goto('/login?from=%25zz');
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    const link = page.locator('a[href^="/register"]').filter({ hasText: 'إنشاء حساب' }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toBe('/register');
  });

  test('registration return links remain same-origin for protocol-relative and backslash inputs', async ({ page }) => {
    for (const destination of ['//attacker.example/path', '/\\\\attacker.example/path', 'javascript:alert(1)']) {
      await page.goto('/login?from=' + encodeURIComponent(destination));
      const link = page.locator('a[href^="/register"]').filter({ hasText: 'إنشاء حساب' }).first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toBe('/register');
      expect(new URL(href!, page.url()).origin).toBe(new URL(page.url()).origin);
    }
  });

  test('offline tab keyboard navigation keeps the active panel and URL synchronized', async ({ page }) => {
    await page.goto('/offline');
    const tablist = page.getByRole('tablist', { name: 'أقسام مركز الأوفلاين' });
    const tabs = tablist.getByRole('tab');
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });
    const active = tablist.getByRole('tab', { name: /جاهزية/ }).first();
    await active.click();
    await expect(active).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('warming');
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });
});
