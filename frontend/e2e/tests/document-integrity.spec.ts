import { expect, test } from '@playwright/test';

const publicRoutes = [
  '/', '/search', '/ads', '/products', '/services', '/categories', '/stores',
  '/requests', '/about', '/contact', '/privacy', '/terms', '/offline',
];

test.describe('document integrity across public routes', () => {
  for (const route of publicRoutes) {
    test(`${route} returns a usable Arabic document`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response, `Missing document response: ${route}`).not.toBeNull();
      expect(response!.status(), `${route} returned ${response!.status()}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', /ar/i);
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }

  test('document direction is RTL for Arabic UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('the homepage exposes a visible main landmark and non-empty title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/\S+/);
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('public pages do not render duplicate element IDs', async ({ page }) => {
    for (const route of ['/', '/search', '/login', '/register', '/offline']) {
      await page.goto(route);
      const duplicates = await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((node) => node.id);
        return ids.filter((id, index) => ids.indexOf(id) !== index).filter((id, index, all) => all.indexOf(id) === index);
      });
      expect(duplicates, `Duplicate IDs on ${route}: ${duplicates.join(', ')}`).toEqual([]);
    }
  });
});
