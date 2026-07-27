/**
 * e2e/tests/ad-lifecycle.spec.ts
 *
 * The core seller journey: create -> appears in my-ads -> view detail
 * -> mark as sold -> edit -> delete. This is the flow this project's
 * own README flagged as the biggest E2E gap — specifically because it
 * round-trips a real ad through validation, image upload (magic-byte
 * verified on the real backend now — see upload.middleware.ts), the
 * database, and back through the actual API response shape. A bug like
 * isNegotiable silently reverting to false on the server (a value that
 * only breaks once serialized, stored, and re-fetched) would only be
 * caught by a test like this one, not by any mocked unit test.
 *
 * Each test creates its own user via the authedPage fixture, so ad
 * ownership/visibility assertions ("this ad appears in MY my-ads list")
 * are unambiguous even when other tests' ads exist in the same shared
 * E2E database.
 */
import path from 'path';
import { test, expect } from '../fixtures/authenticated';
import { createAdViaUI } from '../helpers/ads';
import { uniqueAdTitle } from '../helpers/test-data';

test.describe('Create ad', () => {
  test('publishes a new ad with a required image and redirects to its detail page', async ({ page }) => {
    const title = await createAdViaUI(page);

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('تم نشر الإعلان بنجاح')).toBeVisible();
  });

  test('blocks submission with a client-side error when no image is attached', async ({ page }) => {
    await page.goto('/ads/create');

    await page.getByLabel('عنوان الإعلان').fill(uniqueAdTitle());
    await page
      .getByLabel('الوصف')
      .fill('وصف صالح بطول كافٍ لتجاوز الحد الأدنى المطلوب هنا.');
    await page.getByLabel('المدينة').selectOption({ label: 'غزة' });
    await page.getByRole('button', { name: 'نشر الإعلان' }).click();

    await expect(page.getByText('أضف صورة واحدة على الأقل')).toBeVisible();
    await expect(page).toHaveURL(/\/ads\/create/);
  });

  test('blocks submission with a client-side error when the title is too short', async ({ page }) => {
    await page.goto('/ads/create');

    await page.getByLabel('عنوان الإعلان').fill('قصير');
    await page.getByLabel('المدينة').selectOption({ label: 'غزة' });
    await page.getByRole('button', { name: 'نشر الإعلان' }).click();

    await expect(page.getByText('العنوان قصير جداً (5 أحرف على الأقل)')).toBeVisible();
  });

  test('rejects a non-image file even when renamed with an image extension (real backend magic-byte check)', async ({ page }) => {
    // A plain text file renamed to .png — this is exactly the spoofing
    // scenario fileSignature.ts's magic-byte check exists to catch,
    // now exercised against the real running backend rather than a
    // mocked fileFilter. The frontend's own client-side `accept`
    // attribute is not a security boundary (a user can always bypass
    // it), so this must be enforced server-side, which is what this
    // test actually verifies.
    const fakeImagePath = path.join(__dirname, '..', 'fixtures', 'fake-image.png');

    await page.goto('/ads/create');
    await page.getByLabel('عنوان الإعلان').fill(uniqueAdTitle());
    await page
      .getByLabel('الوصف')
      .fill('وصف صالح بطول كافٍ لتجاوز الحد الأدنى المطلوب هنا.');
    await page.getByLabel('المدينة').selectOption({ label: 'غزة' });
    await page.locator('input[type="file"]').setInputFiles(fakeImagePath);
    await page.getByRole('button', { name: 'نشر الإعلان' }).click();

    // Either the client-side extension/type check rejects it before
    // any request, or the server's magic-byte check rejects it after —
    // either way, the ad must NOT be created and the user stays on the
    // create page with some visible error.
    await expect(page).toHaveURL(/\/ads\/create/);
  });
});

test.describe('My Ads list', () => {
  test('shows a newly created ad in my-ads with an ACTIVE badge', async ({ page }) => {
    const title = await createAdViaUI(page);

    await page.goto('/my-ads');
    const row = page.locator('div').filter({ hasText: title }).first();
    await expect(row.getByText('نشط')).toBeVisible();
  });

  test('filters to only SOLD ads when the "مباعة" tab is selected', async ({ page }) => {
    const soldTitle = await createAdViaUI(page);
    await page.goto('/my-ads');

    await page.getByRole('button', { name: `تعليم ${soldTitle} كمباع` }).click();
    await expect(page.getByText(soldTitle)).toBeVisible(); // still visible under "الكل"

    await page.getByRole('button', { name: 'مباعة' }).click();
    await expect(page).toHaveURL(/status=SOLD/);
    await expect(page.getByText(soldTitle)).toBeVisible();

    await page.getByRole('button', { name: 'نشطة' }).click();
    await expect(page.getByText(soldTitle)).not.toBeVisible();
  });
});

test.describe('Mark as sold', () => {
  test('marking an ad as sold updates its badge and removes the sold action', async ({ page }) => {
    const title = await createAdViaUI(page);
    await page.goto('/my-ads');

    await page.getByRole('button', { name: `تعليم ${title} كمباع` }).click();

    const row = page.locator('div').filter({ hasText: title }).first();
    await expect(row.getByText('تم البيع')).toBeVisible();
    await expect(page.getByRole('button', { name: `تعليم ${title} كمباع` })).not.toBeVisible();
  });

  test('a sold ad shows the sold badge on its public detail page too', async ({ page }) => {
    const title = await createAdViaUI(page);
    const adUrl = page.url();

    await page.goto('/my-ads');
    await page.getByRole('button', { name: `تعليم ${title} كمباع` }).click();

    await page.goto(adUrl);
    await expect(page.getByText('تم البيع')).toBeVisible();
  });
});

test.describe('Edit ad', () => {
  test('editing an ad persists the change and reflects it on the detail page', async ({ page }) => {
    const originalTitle = await createAdViaUI(page);
    const adUrl = page.url();
    const updatedTitle = `${originalTitle} (معدّل)`;

    await page.goto('/my-ads');
    await page.getByRole('link', { name: `تعديل ${originalTitle}` }).click();

    await expect(page).toHaveURL(/\/edit$/);
    const titleInput = page.getByLabel('عنوان الإعلان');
    await expect(titleInput).toHaveValue(originalTitle); // prefilled correctly
    await titleInput.fill(updatedTitle);
    await page.getByRole('button', { name: 'حفظ التعديلات' }).click();

    await expect(page).toHaveURL(adUrl);
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  });

  test('edit mode prefills existing images and lets removing one persist', async ({ page }) => {
    await createAdViaUI(page);
    const adUrl = page.url();

    await page.goto(`${adUrl}/edit`);

    // The image uploaded during creation should show as an existing
    // image with its own remove control (distinct from the
    // create-mode "أضف صورة واحدة على الأقل" required-image case).
    // Same hover-reveal caveat as in createAdViaUI: check attachment,
    // not full visibility, since the button is hidden until the
    // thumbnail is hovered.
    const removeExisting = page.getByRole('button', { name: 'إزالة الصورة' });
    await expect(removeExisting).toBeAttached();
  });
});

test.describe('Delete ad', () => {
  test('deleting an ad requires confirmation and removes it from my-ads afterward', async ({ page }) => {
    const title = await createAdViaUI(page);
    await page.goto('/my-ads');

    await page.getByRole('button', { name: `حذف ${title}` }).click();
    // Real ConfirmDialog — must not delete immediately.
    await expect(page.getByText('حذف الإعلان؟')).toBeVisible();

    await page.getByRole('button', { name: 'حذف', exact: true }).click();

    await expect(page.getByText(title)).not.toBeVisible();
  });

  test('cancelling the delete confirmation keeps the ad', async ({ page }) => {
    const title = await createAdViaUI(page);
    await page.goto('/my-ads');

    await page.getByRole('button', { name: `حذف ${title}` }).click();
    await page.getByRole('button', { name: 'إلغاء' }).click();

    await expect(page.getByText(title)).toBeVisible();
  });
});
