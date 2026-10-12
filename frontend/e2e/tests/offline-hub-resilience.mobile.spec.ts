import { expect, test } from '../fixtures/authenticated';

/** Mobile regression: the compact tab labels and offline navigation remain usable. */
test('mobile offline hub can switch between saved items and drafts while offline', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/offline?tab=warming');
  await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unsupported');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'جاهزية التطبيق بدون نت' })).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  try {
    await context.setOffline(true);
    const savedTab = page.getByRole('tab', { name: 'محفوظات' });
    await savedTab.click();
    await expect(savedTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'المحفوظات المتاحة دون اتصال' })).toBeVisible();

    const draftsTab = page.getByRole('tab', { name: 'مسودات' });
    await draftsTab.click();
    await expect(draftsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'مسوداتك على هذا الجهاز' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
