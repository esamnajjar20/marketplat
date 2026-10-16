import { expect, test } from '@playwright/test';

/**
 * Coverage for business journeys that need an authenticated account or seeded
 * data. These checks deliberately validate the real browser boundary without
 * pretending that an unauthenticated test has completed a backend transaction.
 */
const authenticatedOperations = [
  { name: 'create an advertisement', path: '/ads/create' },
  { name: 'edit an owned advertisement', path: '/my-ads/e2e-ad-id/edit' },
  { name: 'create a store product', path: '/my-store/products/new' },
  { name: 'manage store settings', path: '/my-store' },
  { name: 'create a service listing', path: '/my-services/new' },
  { name: 'follow sellers', path: '/following' },
  { name: 'open favorites', path: '/favorites' },
  { name: 'open conversations', path: '/messages' },
  { name: 'open notifications', path: '/notifications' },
  { name: 'change account settings', path: '/settings' },
  { name: 'manage sales', path: '/account/sales' },
  { name: 'manage CRM customers', path: '/account/customers' },
  { name: 'create a customer request', path: '/requests/new' },
  { name: 'manage saved searches', path: '/saved-searches' },
  { name: 'open the account dashboard', path: '/dashboard' },
  { name: 'review own service requests', path: '/requests/me' },
  { name: 'manage service offers', path: '/requests/offers' },
];

test.describe('missing business operations: authentication boundary', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  for (const operation of authenticatedOperations) {
    test(`${operation.name} requires an authenticated session`, async ({ page }) => {
      const response = await page.goto(operation.path, { waitUntil: 'domcontentloaded' });

      // Middleware may redirect before the page is rendered; both are valid as
      // long as the visitor ends at login and never sees the protected screen.
      expect(response).not.toBeNull();
      await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 10_000 });
      await expect(page.locator('body')).toBeVisible();
    });
  }

  test('a protected operation remains gated after a hard reload', async ({ page }) => {
    await page.goto('/account/sales', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 10_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 10_000 });
  });

  test('protected route query strings cannot bypass the login gate', async ({ page }) => {
    await page.goto('/ads/create?from=%2Faccount%2Fsales&next=https%3A%2F%2Fevil.example', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });
});
