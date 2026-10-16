import { expect, test } from '@playwright/test';

function searchInput(page: import('@playwright/test').Page) {
  return page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('deep search state regressions', () => {
  test('browser back and forward keep the search URL and input synchronized', async ({ page }) => {
    await page.goto('/search');
    const input = searchInput(page);

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

  test('submitting search retains supported filters and resets only pagination', async ({ page }) => {
    await page.goto('/search?city=' + encodeURIComponent('غزة') + '&type=ads&page=7');
    const input = searchInput(page);
    await input.fill('سيارة');
    await input.press('Enter');

    await expect.poll(() => {
      const params = new URL(page.url()).searchParams;
      return [params.get('q'), params.get('city'), params.get('type'), params.has('page')].join('|');
    }).toBe('سيارة|غزة|ads|false');
  });

  test('a hostile return destination never changes the registration link origin', async ({ page }) => {
    const hostile = 'https://attacker.example/collect';
    await page.goto('/login?from=' + encodeURIComponent(hostile));
    const link = page.locator('a[href^="/register"]').filter({ hasText: 'إنشاء حساب' }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });

    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    const target = new URL(href!, page.url());
    expect(target.origin).toBe(new URL(page.url()).origin);
    expect(target.pathname).toBe('/register');
    // Unsafe external destinations are intentionally dropped before they
    // reach the registration flow.
    expect(target.searchParams.has('from')).toBe(false);
  });

  test('malformed return destination does not prevent the login page from rendering', async ({ page }) => {
    const response = await page.goto('/login?from=%25zz');
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });
});

test.describe('server and browser resilience', () => {
  test('a temporary products API 503 leaves the page document and error UI usable', async ({ page }) => {
    let apiRequests = 0;
    await page.route('**/api/**', async (route) => {
      apiRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Service temporarily unavailable' }),
      });
    });

    const response = await page.goto('/products', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect.poll(() => apiRequests, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('حدث خطأ أثناء تحميل المنتجات', { exact: false })).toBeVisible({ timeout: 15_000 });
  });

  test('a script-shaped query remains inert through a reload', async ({ page }) => {
    const payload = '<img src=x onerror=alert(1)>';
    await page.addInitScript(() => {
      window.alert = () => { document.documentElement.dataset.e2eAlertExecuted = 'true'; };
    });
    await page.goto('/search?q=' + encodeURIComponent(payload));
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toHaveValue(payload);
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toHaveValue(payload);
    await expect(page.locator('html')).not.toHaveAttribute('data-e2e-alert-executed', 'true');
    await expect(page.getByRole('heading', { name: 'البحث' })).toBeVisible();
  });
});
