import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'small mobile', width: 320, height: 720 },
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1365, height: 900 },
];

test('search remains visible and the document avoids horizontal overflow across viewport sizes', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/search');
    await expect(page.getByRole('searchbox').first(), `Search should be visible at ${viewport.name}`).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `Horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});

test('reduced-motion preference does not prevent key public page rendering', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/search', '/offline']) {
    const response = await page.goto(route);
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  }
});
