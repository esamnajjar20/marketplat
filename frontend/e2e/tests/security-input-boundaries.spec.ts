import { expect, test } from '@playwright/test';

function searchInput(page: import('@playwright/test').Page) {
  return page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('security input boundaries', () => {
  test('HTML-looking search text is retained as text and does not execute handlers', async ({ page }) => {
    const payload = '<svg onload=alert(1)>بحث</svg>';
    await page.addInitScript(() => {
      window.alert = () => { document.documentElement.dataset.alertExecuted = 'yes'; };
    });
    await page.goto('/search?q=' + encodeURIComponent(payload));
    await expect(searchInput(page)).toHaveValue(payload);
    await expect(page.locator('html')).not.toHaveAttribute('data-alert-executed', 'yes');
    await expect(page.locator('svg[onload]')).toHaveCount(0);
  });

  test('encoded delimiters in a query do not create extra URL parameters', async ({ page }) => {
    const payload = 'هاتف&admin=true#fragment';
    await page.goto('/search?q=' + encodeURIComponent(payload));
    await expect(searchInput(page)).toHaveValue(payload);
    const params = new URL(page.url()).searchParams;
    expect(params.get('q')).toBe(payload);
    expect(params.has('admin')).toBe(false);
  });

  test('login route tolerates unusual but encoded return destinations', async ({ page }) => {
    const oddDestination = '/favorites?tab=all&next=%2Fmessages';
    const response = await page.goto('/login?from=' + encodeURIComponent(oddDestination));
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });

  test('external return URL cannot produce an external registration anchor', async ({ page }) => {
    await page.goto('/login?from=' + encodeURIComponent('https://evil.example/steal'));
    const registration = page.locator('a[href^="/register"]').filter({ hasText: 'إنشاء حساب' }).first();
    await expect(registration).toBeVisible();
    const href = await registration.getAttribute('href');
    expect(href).toBeTruthy();
    expect(new URL(href!, page.url()).origin).toBe(new URL(page.url()).origin);
  });
});
