import { expect, test } from '@playwright/test';

test.describe('search query boundary handling', () => {
  const unusualQueries = [
    'سيارة مستعملة',
    '  كلمات   متعددة  ',
    '100% خصم',
    '<script>alert(1)</script>',
    '" OR 1=1 --',
    'ا'.repeat(180),
  ];

  for (const query of unusualQueries) {
    test(`search URL remains renderable for query: ${query.slice(0, 28)}`, async ({ page }) => {
      await page.goto(`/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'البحث' })).toBeAttached();
      // Treat the query as text: it must never create an executable script element.
      const executableScriptText = await page.locator('script').evaluateAll((scripts) =>
        scripts.map((script) => script.textContent ?? '').join('\n'),
      );
      expect(executableScriptText).not.toContain('alert(1)');
    });
  }

  test('malformed and repeated query parameters do not crash search', async ({ page }) => {
    const response = await page.goto('/search?q=%E0%A4%A&q=second&page=-1', { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'البحث' })).toBeAttached();
  });
});
