import { expect, test } from '@playwright/test';

const publicRoutes = [
  '/',
  '/search',
  '/ads',
  '/products',
  '/services',
  '/categories',
  '/stores',
  '/requests',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/offline',
];

test.describe('public marketplace routes', () => {
  for (const route of publicRoutes) {
    test(`${route} responds and renders a document`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response, `No document response for ${route}`).not.toBeNull();
      expect(response!.status(), `${route} returned HTTP ${response!.status()}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }
});

test('homepage has a main landmark and a non-empty document title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator('main').first()).toBeVisible();
});

test('authentication pages render usable forms', async ({ page }) => {
  for (const route of ['/login', '/register', '/forgot-password']) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('input').first(), `${route} should expose an input`).toBeVisible();
  }
});

test('unauthenticated user is redirected away from protected account pages', async ({ page }) => {
  for (const route of ['/dashboard', '/favorites', '/messages', '/settings', '/ads/create']) {
    await page.context().clearCookies();
    await page.goto(route);
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 10_000 });
  }
});

test('mobile viewport does not overflow horizontally on key public routes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ['/', '/search', '/ads', '/categories']) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});
