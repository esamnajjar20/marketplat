import { expect, test } from '@playwright/test';

function input(page: import('@playwright/test').Page) {
  return page.locator('main').getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('search query safety and edge cases', () => {
  test('script-like query is treated as text rather than executed markup', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('<script>window.__e2eXss=1</script>'));
    await expect(input(page)).toHaveValue('<script>window.__e2eXss=1</script>');
    expect(await page.evaluate(() => (window as Window & { __e2eXss?: number }).__e2eXss)).toBeUndefined();
    await expect(page.locator('main script')).toHaveCount(0);
  });

  test('encoded separators remain part of the search query', async ({ page }) => {
    const query = 'سيارة&city=غزة';
    await page.goto('/search?q=' + encodeURIComponent(query));
    await expect(input(page)).toHaveValue(query);
    expect(new URL(page.url()).searchParams.get('city')).toBeNull();
  });

  test('malformed coordinate and pagination values do not crash search', async ({ page }) => {
    const response = await page.goto('/search?lat=NaN&lng=9999&page=-5&sort=unknown');
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(input(page)).toBeVisible();
  });

  test('search form has a named search landmark and labeled search field', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('main').getByRole('search').first()).toBeVisible();
    await expect(input(page)).toBeVisible();
  });

  test('empty q parameter remains a valid search page state', async ({ page }) => {
    const response = await page.goto('/search?q=');
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(input(page)).toBeVisible();
  });
});
