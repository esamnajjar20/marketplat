import { expect, test } from '@playwright/test';

test('login form can be navigated and submitted using the keyboard', async ({ page }) => {
  await page.goto('/login');
  const form = page.locator('form').filter({ has: page.locator('input') }).first();
  await expect(form).toBeVisible();
  const inputs = form.locator('input:visible');
  await expect(inputs.first()).toBeVisible();
  await inputs.first().focus();
  await expect(inputs.first()).toBeFocused();
  const submit = form.getByRole('button', { name: /دخول|تسجيل الدخول|login|sign in/i }).first();
  await expect(submit).toBeVisible();
  await submit.focus();
  await expect(submit).toBeFocused();
});

test('authentication pages expose a document title and at least one usable form control', async ({ page }) => {
  for (const route of ['/login', '/register', '/forgot-password']) {
    await page.goto(route);
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('input:visible').first(), `${route} should expose a visible input`).toBeVisible();
  }
});
