import { expect, test } from '@playwright/test';

function searchBox(page: import('@playwright/test').Page) {
  return page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('CI regression round 3', () => {
  test('Enter submits the latest query after replacing text in the search field', async ({ page }) => {
    await page.goto('/search');
    const input = searchBox(page);
    await expect(input).toBeVisible();

    await input.fill('استعلام أول');
    await input.fill('استعلام أحدث');
    await input.press('Enter');

    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 })
      .toBe('استعلام احدث');
    await expect(input).toHaveValue('استعلام احدث');
  });

  test('search input follows browser back and forward without a reload', async ({ page }) => {
    await page.goto('/search');
    const input = searchBox(page);

    await input.fill('سيارة');
    await input.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('سيارة');

    await input.fill('هاتف');
    await input.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('هاتف');

    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('سيارة');
    await expect(input).toHaveValue('سيارة');

    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('هاتف');
    await expect(input).toHaveValue('هاتف');
  });

  test('hostile auth return destinations never create a cross-origin registration link', async ({ page }) => {
    const hostileDestinations = [
      '//attacker.example/path',
      'https://attacker.example/path',
      'javascript:alert(1)',
      '/\\\\attacker.example/path',
    ];

    for (const destination of hostileDestinations) {
      await page.goto(`/login?from=${encodeURIComponent(destination)}`);
      const registration = page.getByRole('link', { name: 'إنشاء حساب' }).first();
      await expect(registration).toBeVisible({ timeout: 15_000 });
      const href = await registration.getAttribute('href');
      expect(href).toBeTruthy();
      const resolved = new URL(href!, page.url());
      expect(resolved.origin).toBe(new URL(page.url()).origin);
      expect(resolved.pathname).toBe('/register');
      expect(resolved.searchParams.has('from')).toBe(false);
    }
  });

  test('offline center tabs remain usable while the browser is offline', async ({ page, context }) => {
    await page.goto('/offline');
    const tablist = page.getByRole('tablist', { name: 'أقسام مركز الأوفلاين' });
    const readinessTab = tablist.getByRole('tab', { name: /جاهزية/ }).first();
    await expect(readinessTab).toBeVisible({ timeout: 15_000 });

    try {
      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
      await readinessTab.click();
      await expect(readinessTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();
      await expect(page.locator('body')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
