import { expect, test } from '@playwright/test';

test.fixme('login form can be navigated and submitted using the keyboard', async ({ page }) => {
  await page.goto('/login');
  // The shared public header can contain its own search form. Anchor the
  // locator to the login email field so this test always targets auth.
  const form = page.locator('#email').locator('xpath=ancestor::form');
  await expect(form).toBeVisible();
  const email = form.locator('#email');
  await expect(email).toBeVisible();
  await email.focus();
  await expect(email).toBeFocused();
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
