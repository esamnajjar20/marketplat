import { expect, test } from '@playwright/test';

const coreRoutes = ['/', '/search', '/products', '/services', '/categories', '/stores', '/requests', '/offline'];

test.describe('public page structure and Arabic accessibility', () => {
  for (const route of coreRoutes) {
    test(`${route} exposes a visible main landmark`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('main').first()).toBeVisible();
    });
  }

  test('the document declares Arabic language and right-to-left direction', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.locator('html').getAttribute('lang')).toMatch(/^ar(?:-|$)/i);
    await expect.poll(() => page.locator('html').getAttribute('dir')).toBe('rtl');
  });

  test('the homepage has a meaningful title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/سوق غزة|سوق|إعلانات|منتجات/i);
  });

  test('the search page exposes a labeled search form and search field', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('search').first()).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toBeVisible();
  });

  test('the offline center has a heading and labeled tab list', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: /مركز الأوفلاين/ })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'أقسام مركز الأوفلاين' })).toBeVisible();
  });

  test('public pages do not return server errors for common query strings', async ({ page }) => {
    for (const route of ['/search?q=' + encodeURIComponent('سيارة مستعملة'), '/products?page=1', '/categories?sort=name']) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response, `No response for ${route}`).not.toBeNull();
      expect(response!.status(), `${route} returned HTTP ${response!.status()}`).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('the not-found page recovery links point to real public routes', async ({ page }) => {
    await page.goto('/e2e-route-that-does-not-exist-123');
    await expect(page.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeVisible();
    const home = page.getByRole('link', { name: 'العودة للرئيسية' });
    const search = page.getByRole('link', { name: 'البحث في المنصة' });
    await expect(home).toHaveAttribute('href', '/');
    await expect(search).toHaveAttribute('href', '/search');
  });

  test('a narrow mobile viewport does not overflow on browse and account-entry pages', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    for (const route of ['/', '/search', '/products', '/services', '/login', '/offline']) {
      await page.goto(route);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(widths.viewport + 1);
    }
  });
});

test.describe('offline center tab behavior', () => {
  test('the default offline tab is selected and exposes its panel', async ({ page }) => {
    await page.goto('/offline?tab=saved');
    const selectedTab = page.getByRole('tab', { name: /محفوظاتي|محفوظات/, exact: false }).first();
    await expect(selectedTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('the guest readiness tab can be selected without navigating away', async ({ page }) => {
    await page.goto('/offline');
    const warmingTab = page.getByRole('tab', { name: /جاهزية/ }).first();
    await warmingTab.click();
    await expect(warmingTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/offline(?:\?.*)?$/);
  });

  test('the warming query parameter opens the guest-accessible readiness tab', async ({ page }) => {
    await page.goto('/offline?tab=warming');
    await expect(page.getByRole('tab', { name: /جاهزية/ }).first()).toHaveAttribute('aria-selected', 'true');
  });

  test('tab navigation keeps the offline center heading available', async ({ page }) => {
    await page.goto('/offline');
    for (const name of [/جاهزية/, /محفوظات/]) {
      const tab = page.getByRole('tab', { name }).first();
      if (await tab.count()) {
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('heading', { name: /مركز الأوفلاين/ })).toBeVisible();
      }
    }
  });
});
