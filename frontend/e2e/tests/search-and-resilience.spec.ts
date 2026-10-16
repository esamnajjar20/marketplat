import { expect, test } from '@playwright/test';

test.describe('search journey', () => {
  test('submitting an Arabic search updates the query string and keeps the query visible', async ({ page }) => {
    await page.goto('/search');
    const search = page.getByRole('search');
    const input = search.getByRole('searchbox', { name: 'بحث' });

    await input.fill('  سيارة   مستعملة  ');
    await search.getByRole('button', { name: 'بحث' }).click();

    await expect(page).toHaveURL(/\/search\?q=/);
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('سيارة مستعملة');
    await expect(input).toHaveValue('سيارة مستعملة');
  });

  test('a query supplied in the URL is reflected in the search field', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('هاتف ذكي'));
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toHaveValue('هاتف ذكي');
  });

  test('submitting an empty search does not create an empty q parameter', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('عبارة سابقة'));
    const search = page.getByRole('search');
    await search.getByRole('searchbox', { name: 'بحث' }).fill('   ');
    await search.getByRole('button', { name: 'بحث' }).click();

    // Wait for the App Router navigation to commit before checking the URL.
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false);
    await expect(page).toHaveURL(/\/search(?:\?.*)?$/);
  });
});

test.describe('resilience and error handling', () => {
  test('an unknown URL displays the localized not-found page with recovery links', async ({ page }) => {
    await page.goto('/this-route-should-not-exist-e2e');
    await expect(page.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'العودة للرئيسية' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'البحث في المنصة' })).toHaveAttribute('href', '/search');
  });

  test('a failed products API request does not crash the page document', async ({ page }) => {
    await page.route('**/api/**', async (route) => route.abort('failed'));
    const response = await page.goto('/products', { waitUntil: 'domcontentloaded' });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('search URL edge cases', () => {
  test('a query containing Arabic punctuation is restored from the URL', async ({ page }) => {
    const query = 'سوق غزة؟ سيارات، شقق!';
    await page.goto('/search?q=' + encodeURIComponent(query));
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toHaveValue(query);
  });

  test('an explicit empty query does not crash the search page', async ({ page }) => {
    const response = await page.goto('/search?q=');
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toBeVisible();
  });

  test('invalid nearby coordinates do not crash search rendering', async ({ page }) => {
    const response = await page.goto('/search?lat=abc&lng=def&sort=distance');
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('the search page can be reloaded with the same query', async ({ page }) => {
    const query = 'هاتف مستعمل';
    await page.goto('/search?q=' + encodeURIComponent(query));
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toHaveValue(query);
  });
});
