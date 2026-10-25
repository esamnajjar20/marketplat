import { expect, test } from '@playwright/test';

const responsiveRoutes = ['/', '/search', '/ads', '/products', '/categories', '/stores'];

test.describe('browser quality and resilience', () => {
  for (const width of [320, 360, 390, 768]) {
    test(`key pages avoid horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      for (const route of responsiveRoutes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        const size = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(size.content, `Horizontal overflow on ${route} at ${width}px`).toBeLessThanOrEqual(size.viewport + 2);
      }
    });
  }

  test('primary public routes do not emit uncaught page exceptions', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    for (const route of ['/', '/search', '/products', '/categories']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
    }
    expect(pageErrors, `Uncaught browser exceptions:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('rendered links do not use javascript URLs', async ({ page }) => {
    for (const route of ['/', '/search', '/products', '/categories']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const unsafeLinks = await page.locator('a[href]').evaluateAll((links) => links
        .map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? '')
        .filter((href) => /^\s*javascript:/i.test(href)));
      expect(unsafeLinks, `Unsafe javascript: link found on ${route}`).toEqual([]);
    }
  });

  test('main landmark exists on core public pages', async ({ page }) => {
    for (const route of ['/', '/search', '/ads', '/products', '/categories']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main').first(), `Missing main landmark on ${route}`).toBeAttached();
    }
  });
});
