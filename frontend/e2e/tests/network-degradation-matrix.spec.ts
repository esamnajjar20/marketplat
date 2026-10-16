import { expect, test } from '@playwright/test';

test('search and public shell remain usable when API requests fail', async ({ page }) => {
  await page.route(/\/api\/|\/trpc\//, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'E2E simulated upstream outage' }),
  }));
  const response = await page.goto('/search');
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByRole('searchbox').first()).toBeVisible();
  const input = page.getByRole('searchbox').first();
  await input.fill('network outage recovery');
  await input.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 }).toBe('network outage recovery');
});

test('offline page remains rendered when fetch calls reject', async ({ page }) => {
  await page.route('**/*', async route => {
    const request = route.request();
    if (request.resourceType() !== 'document' && /\/api\/|\/trpc\//.test(request.url())) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const response = await page.goto('/offline');
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
});
