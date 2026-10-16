import { expect, test, type Page } from '@playwright/test';

/** Real database-backed journeys. Legacy filename is kept to replace the old mocked suite in-place. */
const buyer = { email: 'e2e-buyer@example.test', password: 'E2eBuyerPass123!' };
const seller = { email: 'e2e-seller@example.test', password: 'E2eSellerPass123!' };
const admin = { email: 'e2e-admin@example.test', password: 'E2eAdminPass123!' };
const adId = 'e2e-seeded-ad';
const productId = 'e2e-seeded-product';
const serviceId = 'e2e-seeded-service';
const sellerId = 'e2e-seller-user';

test.describe('real low-coverage business journeys (live frontend + backend + test database)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60_000);

  async function login(page: Page, account: typeof buyer | typeof seller | typeof admin) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toBeEmpty();
  }

  test('CRM creates a customer and persists a VIP update through the real API', async ({ page }) => {
    await login(page, seller);
    await page.goto('/account/customers', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'إدارة العملاء CRM' })).toBeVisible();
    const name = `E2E Customer ${Date.now()}`;
    await page.getByRole('button', { name: 'عميل جديد' }).click();
    await page.getByPlaceholder('الاسم *').fill(name);
    await page.getByRole('button', { name: 'حفظ العميل' }).click();
    const card = page.locator('article').filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'تعيين VIP' }).click();
    await expect(card.getByRole('button', { name: 'إزالة VIP' })).toBeVisible({ timeout: 15_000 });
  });

  test('saved search is created by the UI and appears in the real saved-search list', async ({ page }) => {
    await login(page, buyer);
    const label = `E2E saved search ${Date.now()}`;
    await page.goto(`/search?q=${encodeURIComponent(`سيارة اختبار ${Date.now()}`)}`, { waitUntil: 'domcontentloaded' });
    const save = page.getByRole('button', { name: 'حفظ البحث', exact: true });
    await expect(save).toBeVisible({ timeout: 15_000 });
    await save.click();
    await page.getByRole('button', { name: 'إعلان', exact: true }).click();
    await page.locator('#saved-search-label').fill(label);
    await page.getByRole('dialog').getByRole('button', { name: 'حفظ البحث', exact: true }).click();
    await page.goto('/saved-searches', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('favorite toggle persists for a real seeded advertisement', async ({ page }) => {
    await login(page, buyer);
    await page.goto(`/ads/${adId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'E2E سيارة اختبار للبيع' })).toBeVisible({ timeout: 20_000 });
    const add = page.getByRole('button', { name: 'إضافة إلى المفضلة', exact: true });
    if (await add.count()) await add.click();
    await expect(page.getByRole('button', { name: 'إزالة من المفضلة', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.goto('/favorites', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('E2E سيارة اختبار للبيع', { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('following a real seller updates the following list', async ({ page }) => {
    await login(page, buyer);
    await page.goto(`/profile/${sellerId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'E2E Seller' })).toBeVisible({ timeout: 15_000 });
    const follow = page.getByRole('button', { name: 'متابعة', exact: true });
    if (await follow.count()) await follow.click();
    await expect(page.getByRole('button', { name: 'إلغاء المتابعة', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.goto('/following', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('E2E Seller')).toBeVisible({ timeout: 15_000 });
  });

  test('real messaging creates or reuses a conversation and persists a sent message', async ({ page }) => {
    await login(page, buyer);
    await page.goto(`/profile/${sellerId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'مراسلة', exact: true }).click();
    await expect(page).toHaveURL(/\/messages\/[^/?#]+/, { timeout: 20_000 });
    const message = `E2E message ${Date.now()}`;
    await page.getByRole('textbox', { name: 'نص الرسالة' }).fill(message);
    await page.getByRole('button', { name: 'إرسال' }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('notification data is loaded from the database and marked read through the UI', async ({ page }) => {
    await login(page, buyer);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('إشعار اختبار E2E', { exact: true })).toBeVisible({ timeout: 15_000 });
    const markAll = page.getByRole('button', { name: 'تعليم الكل كمقروء', exact: true });
    if (await markAll.count()) await markAll.click();
    await expect(page.getByText('كل شيء مقروء')).toBeVisible({ timeout: 15_000 });
  });

  test('editing an owned ad persists the change to the real backend', async ({ page }) => {
    await login(page, seller);
    await page.goto(`/my-ads/${adId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#title')).toBeVisible({ timeout: 20_000 });
    const title = `E2E updated ad ${Date.now()}`;
    await page.locator('#title').fill(title);
    await page.locator('#desc').fill('وصف محدث من اختبار متصفح حقيقي يتصل بقاعدة البيانات والباك اند.');
    await page.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await page.goto(`/ads/${adId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });
  });

  test('editing a real store product persists through the backend', async ({ page }) => {
    await login(page, seller);
    await page.goto(`/my-store/products/${productId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#name')).toBeVisible({ timeout: 20_000 });
    const name = `E2E updated product ${Date.now()}`;
    await page.locator('#name').fill(name);
    await page.locator('#description').fill('وصف منتج معدل لاختبار واجهة المتجر مع API وقاعدة بيانات حقيقية.');
    await page.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await page.goto(`/products/${productId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 20_000 });
  });

  test('editing a real service listing persists through the backend', async ({ page }) => {
    await login(page, seller);
    await page.goto(`/my-services/${serviceId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#title')).toBeVisible({ timeout: 20_000 });
    const title = `E2E updated service ${Date.now()}`;
    await page.locator('#title').fill(title);
    await page.locator('#description').fill('وصف خدمة معدل لاختبار حقيقي على خادم التطبيق وقاعدة بيانات الاختبار.');
    await page.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await page.goto(`/services/${serviceId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });
  });

  test('authenticated seller can open live sales, settings, and store pages', async ({ page }) => {
    await login(page, seller);
    await page.goto('/account/sales', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'لوحة المبيعات' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/my-store', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15_000 });
  });

  test('seeded admin can access the real administration dashboard', async ({ page }) => {
    await login(page, admin);
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /إدارة النظام|لوحة الإدارة|لوحة التحكم/ })).toBeVisible({ timeout: 20_000 });
  });
});
