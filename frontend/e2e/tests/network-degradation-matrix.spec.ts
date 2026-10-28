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


test('public shell remains interactive under a throttled mobile connection', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 350,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (512 * 1024) / 8,
    connectionType: 'cellular3g',
  });

  try {
    const response = await page.goto('/search', {
      waitUntil: 'domcontentloaded',
      timeout: 40_000,
    });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    const search = page.getByRole('searchbox').first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('slow network smoke test');
    await search.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 })
      .toBe('slow network smoke test');
  } finally {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
});
