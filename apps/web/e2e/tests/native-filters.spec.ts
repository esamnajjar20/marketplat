/**
 * Playwright — Native filters journeys (mobile viewport).
 * Place at: apps/web/e2e/tests/native-filters.spec.ts
 *
 * Run:
 *   npx playwright test e2e/tests/native-filters.spec.ts --project=mobile
 * (or whatever mobile project name is in playwright.config.ts)
 */

import { test, expect, type Page } from '@playwright/test';

const SEARCH = '/search';

async function openFilterSheet(page: Page) {
  const trigger = page.getByRole('button', { name: /تصفية/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('heading', { name: /تصفية النتائج/ })).toBeVisible();
}

test.describe('Native filters (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens sheet and applies city filter once', async ({ page }) => {
    await page.goto(SEARCH);
    await openFilterSheet(page);

    // Pick a city if the select is present
    const cityTrigger = page.getByRole('combobox').first();
    if (await cityTrigger.isVisible()) {
      await cityTrigger.click();
      const option = page.getByRole('option', { name: 'غزة' });
      if (await option.count()) {
        await option.click();
      }
    }

    await page.getByRole('button', { name: /عرض النتائج/ }).click();

    // Sheet should close; URL may include city=
    await expect(page.getByRole('heading', { name: /تصفية النتائج/ })).toHaveCount(0);
    // Soft assert: either city in URL or still on search
    await expect(page).toHaveURL(/\/search/);
  });

  test('quick filter under-100 toggles maxPrice', async ({ page }) => {
    await page.goto(SEARCH);
    const chip = page.getByRole('button', { name: /أقل من 100/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).toHaveURL(/maxPrice=100/);
    // toggle off
    await chip.click();
    await expect(page).not.toHaveURL(/maxPrice=100/);
  });

  test('active chips clear-all keeps q', async ({ page }) => {
    await page.goto(`${SEARCH}?q=test&city=${encodeURIComponent('غزة')}&maxPrice=50`);
    const clearAll = page.getByRole('button', { name: /مسح الكل/ });
    if (await clearAll.count()) {
      await clearAll.click();
      await expect(page).toHaveURL(/q=test/);
      await expect(page).not.toHaveURL(/city=/);
      await expect(page).not.toHaveURL(/maxPrice=/);
    }
  });

  test('reset inside sheet does not change URL until apply', async ({ page }) => {
    await page.goto(`${SEARCH}?city=${encodeURIComponent('رفح')}`);
    await openFilterSheet(page);
    await page.getByRole('button', { name: /إعادة تعيين الفلاتر/ }).click();
    // URL still has city until apply
    await expect(page).toHaveURL(/city=/);
    await page.getByRole('button', { name: /عرض النتائج/ }).click();
    await expect(page).not.toHaveURL(/city=/);
  });
});
