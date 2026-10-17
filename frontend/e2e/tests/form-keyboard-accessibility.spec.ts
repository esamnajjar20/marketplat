import { expect, test } from '@playwright/test';

test('login form can be navigated and submitted using the keyboard', async ({ page }) => {
  let loginRequests = 0;
  await page.route('**/auth/login', async (route) => {
    loginRequests += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'بيانات الدخول غير صحيحة' }),
    });
  });

  await page.goto('/login');
  const form = page.locator('#email').locator('xpath=ancestor::form');
  const email = form.locator('#email');
  const password = form.locator('#password');
  const submit = form.getByRole('button', { name: /تسجيل الدخول/ });

  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.type('keyboard@example.com');
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.keyboard.type('valid-looking-password');
  await page.keyboard.press('Tab');
  // The next focusable control is the recovery link; the submit button is
  // intentionally disabled until both required fields have been entered.
  await page.keyboard.press('Tab');
  await expect(form.getByRole('link', { name: 'نسيت كلمة المرور؟' })).toBeFocused();
  await expect(submit).toBeEnabled();

  await submit.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => loginRequests, { timeout: 10_000 }).toBe(1);
});

test('authentication pages expose a document title and at least one usable form control', async ({ page }) => {
  for (const route of ['/login', '/register', '/forgot-password']) {
    await page.goto(route);
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('input:visible').first(), `${route} should expose a visible input`).toBeVisible();
  }
});
