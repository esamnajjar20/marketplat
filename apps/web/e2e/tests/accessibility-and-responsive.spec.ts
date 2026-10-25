import { expect, test } from '@playwright/test';

const responsiveRoutes = ['/', '/search', '/products', '/services', '/categories', '/stores', '/login', '/register', '/offline'];

test.describe('Arabic accessibility and responsive layout', () => {
  test('the root document declares Arabic and right-to-left direction', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.locator('html').getAttribute('lang')).toMatch(/^ar(?:-|$)/i);
    await expect.poll(() => page.locator('html').getAttribute('dir')).toBe('rtl');
  });

  test('auth fields have associated labels', async ({ page }) => {
    for (const routePath of ['/login', '/register', '/forgot-password']) {
      await page.goto(routePath);
      const unlabelledVisibleInputs = await page.locator('input:visible').evaluateAll((inputs) =>
        inputs
          .filter((node) => {
            const input = node as HTMLInputElement;
            if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(input.type)) return false;
            return !(input.labels && input.labels.length > 0) && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby');
          })
          .map((node) => ({ id: (node as HTMLInputElement).id, type: (node as HTMLInputElement).type })),
      );
      expect(unlabelledVisibleInputs, `Unlabelled visible input(s) on ${routePath}`).toEqual([]);
    }
  });

  for (const width of [320, 360, 390]) {
    test(`key pages do not overflow horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      for (const routePath of responsiveRoutes) {
        await page.goto(routePath);
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(dimensions.content, `Horizontal overflow on ${routePath} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
      }
    });
  }

  test('the homepage exposes a visible main landmark and a non-empty title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page).toHaveTitle(/\S+/);
  });
});
