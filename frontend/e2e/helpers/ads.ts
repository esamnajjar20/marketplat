/**
 * e2e/helpers/ads.ts
 *
 * PROD-FIX-14: createAdViaUI previously lived only inside
 * ad-lifecycle.spec.ts (unexported), so the new favorites.spec.ts
 * would otherwise have had to duplicate the exact same
 * fill-form-and-submit sequence. Extracted here instead — same reason
 * auth.ts/test-data.ts already exist as shared helpers rather than
 * being copy-pasted per spec file.
 */
import path from 'path';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { uniqueAdTitle } from './test-data';

export const TEST_IMAGE_PATH = path.join(__dirname, '..', 'fixtures', 'test-image.png');

/**
 * Fills and submits AdForm in create mode with valid, minimal data —
 * every field this form actually requires, nothing extra. Returns the
 * title used, so callers can assert on it later without repeating the
 * literal string.
 */
export async function createAdViaUI(page: Page): Promise<string> {
  const title = uniqueAdTitle();

  await page.goto('/ads/create');
  await page.getByLabel('عنوان الإعلان').fill(title);
  await page
    .getByLabel('الوصف')
    .fill('هذا وصف تجريبي للإعلان يحتوي على أكثر من عشرين حرفاً كما هو مطلوب.');
  await page.getByLabel('المدينة').selectOption({ label: 'غزة' });
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE_PATH);

  // The remove button is only visually revealed on hover
  // (`hidden group-hover:flex` in ImageUpload.tsx) — it exists in the
  // DOM as soon as the file is processed, so checking attachment
  // (not full visibility, which would require hovering first) is the
  // correct way to confirm the async upload/preview step completed
  // before submitting.
  await expect(page.getByRole('button', { name: /إزالة الصورة/ }).first()).toBeAttached();

  await page.getByRole('button', { name: 'نشر الإعلان' }).click();

  await expect(page).toHaveURL(/\/ads\/[a-zA-Z0-9-]+$/);
  return title;
}
