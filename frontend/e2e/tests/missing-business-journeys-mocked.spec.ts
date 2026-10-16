import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Browser-level simulations for low-coverage authenticated business journeys.
 * All external APIs are mocked: these tests exercise the UI/request contract,
 * not real payment, push delivery, Cloudinary, or production authorization.
 */
const apiMeta = { total: 0, page: 1, limit: 50, totalPages: 0, hasNextPage: false, hasPrevPage: false };
const user = {
  id: 'e2e-user-001', name: 'مستخدم اختبار', email: 'e2e@example.test', role: 'USER',
  avatarUrl: null, city: 'نابلس', emailVerified: true, needsProfileCompletion: false,
};
const bootstrap = {
  me: user, notificationsUnread: 0, conversationsUnread: 0,
  notifications: { items: [], meta: apiMeta }, sellerProfile: null, sellerAttention: null,
  adStats: { activeAds: 1, soldAds: 0, totalViews: 0, favoritesCount: 0 },
  favorites: { items: [], meta: apiMeta }, store: null, serviceProvider: null,
};

async function installAuthenticatedApiMocks(page: Page) {
  await page.route('**/*auth/refresh*', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, data: { tokens: { accessToken: 'e2e-access-token', expiresIn: 3600 }, csrfToken: 'e2e-csrf-token' },
    }) });
  });
  await page.route('**/*users/me/bootstrap*', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: bootstrap }) });
  });
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/auth/refresh') || url.pathname.includes('/users/me/bootstrap')) return route.fallback();
    const body = { items: [], data: [], meta: apiMeta, total: 0, unreadCount: 0 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) });
  });
  await page.addInitScript(() => {
    // Zustand persists only display metadata. The real access token is still
    // obtained from the mocked refresh endpoint, as in the production flow.
    localStorage.setItem('marketplace-auth', JSON.stringify({
      state: { user: {
        id: 'e2e-user-001', name: 'مستخدم اختبار', email: 'e2e@example.test', role: 'USER',
        avatarUrl: null, city: 'نابلس', emailVerified: true, needsProfileCompletion: false,
      }, lastKnownRoles: { isSeller: true, isProvider: true, hasActiveStore: true } }, version: 1,
    }));
  });
}

async function openProtected(page: Page, path: string, heading: RegExp | string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 });
}

test.describe('missing business journeys — mocked authenticated browser', () => {
  test.beforeEach(async ({ page }) => installAuthenticatedApiMocks(page));

  test('advertisement creation route renders its form gate', async ({ page }) => {
    await openProtected(page, '/ads/create', 'نشر إعلان جديد');
    await expect(page.locator('main')).toBeVisible();
  });

  test('editing an owned advertisement route handles a missing/mock listing safely', async ({ page }) => {
    await page.goto('/my-ads/e2e-ad-id/edit', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 15_000 });
  });

  test('new store product page renders', async ({ page }) => {
    await openProtected(page, '/my-store/products/new', 'إضافة منتج جديد');
  });

  test('new service listing page renders', async ({ page }) => {
    await openProtected(page, '/my-services/new', 'نشر خدمة جديدة');
  });

  test('following sellers page renders an empty state instead of crashing', async ({ page }) => {
    await openProtected(page, '/following', 'متابعاتي');
    await expect(page.locator('main')).toBeVisible();
  });

  test('favorites page renders for a signed-in user', async ({ page }) => {
    await openProtected(page, '/favorites', 'المفضلة');
  });

  test('messages inbox renders for a signed-in user', async ({ page }) => {
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('اختر محادثة')).toBeVisible({ timeout: 15_000 });
  });

  test('notifications page renders with an empty mocked feed', async ({ page }) => {
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('account settings route renders', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('sales dashboard renders with mocked zero-valued summaries', async ({ page }) => {
    await openProtected(page, '/account/sales', 'لوحة المبيعات');
  });

  test('CRM customer form opens and requires a name', async ({ page }) => {
    await openProtected(page, '/account/customers', 'إدارة العملاء CRM');
    await page.getByRole('button', { name: 'عميل جديد' }).click();
    await expect(page.getByRole('heading', { name: 'عميل جديد' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'حفظ العميل' })).toBeDisabled();
    await page.getByPlaceholder('الاسم *').fill('عميل تجريبي');
    await expect(page.getByRole('button', { name: 'حفظ العميل' })).toBeEnabled();
  });

  test('CRM customer creation sends the entered name to the API', async ({ page }) => {
    let captured: unknown;
    await page.route('**/customers**', async (route) => {
      if (route.request().method() === 'POST') {
        captured = route.request().postDataJSON();
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'customer-e2e', name: 'عميل تجريبي' } }) });
      } else await route.fallback();
    });
    await openProtected(page, '/account/customers', 'إدارة العملاء CRM');
    await page.getByRole('button', { name: 'عميل جديد' }).click();
    await page.getByPlaceholder('الاسم *').fill('عميل تجريبي');
    await page.getByRole('button', { name: 'حفظ العميل' }).click();
    await expect.poll(() => captured).toMatchObject({ name: 'عميل تجريبي' });
  });

  test('service requests owned by the user render safely', async ({ page }) => {
    await page.goto('/requests/me', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('creating a customer request route renders', async ({ page }) => {
    await page.goto('/requests/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('service offers route renders', async ({ page }) => {
    await page.goto('/requests/offers', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('saved searches route renders with empty data', async ({ page }) => {
    await page.goto('/saved-searches', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('store management route renders', async ({ page }) => {
    await page.goto('/my-store', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('installment sales sub-route handles an empty response', async ({ page }) => {
    await page.goto('/account/sales/installments', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('sales debt sub-route handles an empty response', async ({ page }) => {
    await page.goto('/account/sales/debts', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('admin page remains isolated from a normal USER account', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    // The app may redirect or show an authorization page; it must not render
    // the administrative dashboard to a normal account.
    await expect(page.getByRole('heading', { name: /إدارة النظام|لوحة الإدارة|Admin Dashboard/i })).toHaveCount(0, { timeout: 5_000 });
  });
});

 test.describe('mocked high-risk operation boundaries', () => {
  test('payment-shaped API requests never leave the test browser', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', request => {
      if (/stripe|paypal|checkout\.com/i.test(request.url())) externalRequests.push(request.url());
    });
    await installAuthenticatedApiMocks(page);
    await page.goto('/saved-payments', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    expect(externalRequests).toEqual([]);
  });

  test('no real image upload provider is contacted by listing forms', async ({ page }) => {
    const externalUploads: string[] = [];
    page.on('request', request => {
      if (/cloudinary\.com|api\.cloudinary/i.test(request.url())) externalUploads.push(request.url());
    });
    await installAuthenticatedApiMocks(page);
    await page.goto('/ads/create', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'نشر إعلان جديد' })).toBeVisible({ timeout: 15_000 });
    expect(externalUploads).toEqual([]);
  });
});
