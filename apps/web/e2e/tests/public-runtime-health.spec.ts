import { expect, test } from '@playwright/test';

const routes = ['/', '/search', '/ads', '/products', '/services', '/categories', '/stores', '/about', '/contact', '/offline'];

test('key public journeys do not emit uncaught page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `Missing document response for ${route}`).not.toBeNull();
    expect(response!.status(), `${route} returned ${response!.status()}`).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  }
  expect(errors, `Uncaught browser errors:
${errors.join('\n')}`).toEqual([]);
});
