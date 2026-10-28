import { expect, test } from '@playwright/test';

const protectedRoutes = [
  '/dashboard',
  '/favorites',
  '/following',
  '/activity',
  '/messages',
  '/settings',
  '/my-store',
  '/my-services',
  '/ads/create',
  '/account/sales',
  '/account/customers',
];

test.describe('protected route access control', () => {
  for (const routePath of protectedRoutes) {
    test(`${routePath} redirects an unauthenticated visitor to login`, async ({ page, context }) => {
      await context.clearCookies();
      await page.goto(routePath);
      await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 10_000 });
    });
  }
});
