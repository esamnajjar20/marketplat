import { expect, test } from '@playwright/test';

function searchInput(page: import('@playwright/test').Page) {
  return page.getByRole('search').first().getByRole('searchbox', { name: 'بحث' });
}

test.describe('search journeys and URL state', () => {
  test('submitting a query with repeated spaces normalizes it in the URL', async ({ page }) => {
    await page.goto('/search');
    const input = searchInput(page);
    await input.fill('  سيارة   مستعملة  ');
    await page.getByRole('search').first().getByRole('button', { name: 'بحث', exact: true }).click();

    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('سيارة مستعملة');
    await expect(input).toHaveValue('سيارة مستعملة');
  });

  test('a query in the URL is reflected in the search field after page load', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('هاتف ذكي'));
    await expect(searchInput(page)).toHaveValue('هاتف ذكي');
  });

  test('submitting an empty query removes q and page parameters', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('عبارة سابقة') + '&page=4');
    await searchInput(page).fill('   ');
    await page.getByRole('search').first().getByRole('button', { name: 'بحث', exact: true }).click();

    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false);
    await expect.poll(() => new URL(page.url()).searchParams.has('page')).toBe(false);
  });

  test('search submit preserves unrelated filters while resetting pagination', async ({ page }) => {
    await page.goto('/search?city=غزة&page=3');
    await searchInput(page).fill('أثاث');
    await page.getByRole('search').first().getByRole('button', { name: 'بحث', exact: true }).click();

    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('أثاث');
    await expect.poll(() => new URL(page.url()).searchParams.get('city')).toBe('غزة');
    await expect.poll(() => new URL(page.url()).searchParams.has('page')).toBe(false);
  });

  test('pressing Enter submits the search form', async ({ page }) => {
    await page.goto('/search');
    await searchInput(page).fill('معدات منزلية');
    await searchInput(page).press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('معدات منزلية');
  });

  test('the global-search focus shortcut parameter is consumed and focuses the field', async ({ page }) => {
    await page.goto('/search?focus=1');
    await expect(searchInput(page)).toBeFocused({ timeout: 10_000 });
    await expect.poll(() => new URL(page.url()).searchParams.has('focus')).toBe(false);
  });
});
