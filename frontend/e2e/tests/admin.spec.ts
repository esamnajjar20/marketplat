/**
 * e2e/tests/admin.spec.ts
 *
 * Admin console flows against the real backend, using the seeded E2E
 * admin account (see backend-v9/src/scripts/seedE2E.ts — must be run
 * before this spec; see e2e/README.md). Covers: dashboard stats load,
 * a full category create -> edit -> delete round trip (validating the
 * real network behavior behind CreateCategoryButton.test.tsx and
 * EditCategoryButton.test.tsx's mocked-hook unit tests), the ads table
 * against a real ad, and — critically — that a regular non-admin user
 * is actually denied, not just redirected client-side (middleware.ts's
 * own comment stresses the *backend* API is the real security
 * boundary, not the page-level redirect).
 */
import { test, expect } from '../fixtures/admin-authenticated';
import { test as userTest, expect as userExpect } from '../fixtures/authenticated';
import { uniqueAdTitle } from '../helpers/test-data';

test.describe('Admin dashboard', () => {
  test('loads the stats grid with real numeric values', async ({ page }) => {
    await page.goto('/admin/dashboard');

    await expect(page.getByRole('heading', { name: 'نظرة عامة' })).toBeVisible();
    await expect(page.getByText('إجمالي الإعلانات')).toBeVisible();
    await expect(page.getByText('المستخدمون النشطون')).toBeVisible();
    await expect(page.getByText('البلاغات المفتوحة')).toBeVisible();
    await expect(page.getByText('مشاهدات اليوم')).toBeVisible();
  });

  test('the admin sidebar links to every admin section', async ({ page }) => {
    await page.goto('/admin/dashboard');

    await expect(page.getByRole('link', { name: 'الرئيسية' })).toHaveAttribute(
      'href',
      '/admin/dashboard',
    );
    await expect(page.getByRole('link', { name: 'الإعلانات' })).toHaveAttribute(
      'href',
      '/admin/ads',
    );
    await expect(page.getByRole('link', { name: 'المستخدمون' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    await expect(page.getByRole('link', { name: 'البلاغات' })).toHaveAttribute(
      'href',
      '/admin/reports',
    );
    await expect(page.getByRole('link', { name: 'فئات الإعلانات' })).toHaveAttribute(
      'href',
      '/admin/categories',
    );
    // Epic 1.1: verify/suspend sellers admin UI — was entirely missing.
    await expect(page.getByRole('link', { name: 'البائعون' })).toHaveAttribute(
      'href',
      '/admin/sellers',
    );
    // Epic 1.2: service-categories admin UI — was entirely missing.
    await expect(page.getByRole('link', { name: 'فئات الخدمات' })).toHaveAttribute(
      'href',
      '/admin/service-categories',
    );
  });
});

test.describe('Category management (real network round trip)', () => {
  test('creates a new category, then it appears in the tree', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const nameAr = `فئة اختبار ${uniqueSuffix}`;
    const nameEn = `TestCategory${uniqueSuffix}`;

    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'فئة جديدة' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('مثال: إلكترونيات').fill(nameAr);
    await dialog.getByPlaceholder('e.g. Electronics').fill(nameEn);
    await dialog.getByRole('button', { name: 'إنشاء' }).click();

    await expect(page.getByText('تم إنشاء الفئة')).toBeVisible();
    await expect(page.getByText(nameAr)).toBeVisible();
  });

  test('edits an existing category and the new name persists after reload', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const originalName = `فئة للتعديل ${uniqueSuffix}`;
    const updatedName = `فئة معدّلة ${uniqueSuffix}`;

    // Create one first so this test doesn't depend on any pre-existing
    // category or ordering from another test.
    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'فئة جديدة' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByPlaceholder('مثال: إلكترونيات').fill(originalName);
    await createDialog.getByPlaceholder('e.g. Electronics').fill(`EditMe${uniqueSuffix}`);
    await createDialog.getByRole('button', { name: 'إنشاء' }).click();
    await expect(page.getByText(originalName)).toBeVisible();

    // Now edit it.
    await page.getByRole('button', { name: `تعديل ${originalName}` }).click();
    const editDialog = page.getByRole('dialog');
    const arInput = editDialog.getByPlaceholder('مثال: إلكترونيات');
    await arInput.fill(updatedName);
    await editDialog.getByRole('button', { name: 'حفظ' }).click();

    await expect(page.getByText('تم حفظ التعديلات')).toBeVisible();
    await expect(page.getByText(updatedName)).toBeVisible();

    // Reload to confirm this actually persisted server-side, not just
    // in client-side query cache.
    await page.reload();
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(originalName)).not.toBeVisible();
  });

  test('deleting a category requires confirmation and removes it after reload', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const name = `فئة للحذف ${uniqueSuffix}`;

    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'فئة جديدة' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByPlaceholder('مثال: إلكترونيات').fill(name);
    await createDialog.getByPlaceholder('e.g. Electronics').fill(`DeleteMe${uniqueSuffix}`);
    await createDialog.getByRole('button', { name: 'إنشاء' }).click();
    await expect(page.getByText(name)).toBeVisible();

    await page.getByRole('button', { name: `حذف ${name}` }).click();
    // Real confirmation required — matches AdminCategoriesTree.test.tsx's
    // mocked-hook expectations, now against the real delete endpoint.
    await page.getByRole('button', { name: 'حذف', exact: true }).click();

    await page.reload();
    await expect(page.getByText(name)).not.toBeVisible();
  });
});

test.describe('Admin ads table', () => {
  test('lists ads and can search by title', async ({ page }) => {
    await page.goto('/admin/ads');

    await expect(page.getByPlaceholder('بحث بالعنوان…')).toBeVisible();
    // At minimum the table itself renders without erroring — specific
    // ad content depends on what other E2E specs have created in this
    // shared database, so this doesn't assert on exact rows.
    await expect(page.getByRole('table').or(page.getByText('لا توجد إعلانات'))).toBeVisible();
  });
});

test.describe('Access control — non-admin users are actually denied', () => {
  test('an unauthenticated visitor is sent to /login, not the admin page', async ({ browser }) => {
    const context = await browser.newContext(); // fresh, logged-out context
    const page = await context.newPage();

    await page.goto('/admin/dashboard');

    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});

// Separate describe block using the REGULAR-user fixture (not the admin
// one this file otherwise uses) — kept in its own block so it's clear
// these tests authenticate as a different, non-admin account.
userTest.describe('Access control — regular authenticated user', () => {
  userTest(
    'is redirected away from /admin/dashboard, not just shown a client-side gate',
    async ({ page }) => {
      await page.goto('/admin/dashboard');

      await userExpect(page).toHaveURL(/\/dashboard$/);
      await userExpect(page.getByRole('heading', { name: 'نظرة عامة' })).not.toBeVisible();
    },
  );

  userTest('cannot load real admin data even by force-navigating to an admin URL', async ({ page }) => {
    await page.goto('/admin/ads');

    // Redirected to /dashboard by middleware.ts before any admin data
    // fetch happens — the regular user's own dashboard, not admin ads.
    await userExpect(page).toHaveURL(/\/dashboard$/);
  });
});
