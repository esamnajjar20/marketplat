import { expect, test } from '@playwright/test';

const authPages = [
  { route: '/login', fields: ['#email', '#password'] },
  { route: '/register', fields: ['#name', '#email', '#password', '#confirmPassword'] },
  { route: '/forgot-password', fields: ['#email'] },
];

test.describe('authentication form accessibility and boundaries', () => {
  for (const { route, fields } of authPages) {
    test(`${route} exposes its expected visible fields`, async ({ page }) => {
      await page.goto(route);
      for (const selector of fields) await expect(page.locator(selector)).toBeVisible();
    });
  }

  test('login password input masks the entered value', async ({ page }) => {
    await page.goto('/login');
    const password = page.locator('#password');
    await password.fill('sample-password');
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('invalid email does not submit the login request', async ({ page }) => {
    let requests = 0;
    page.on('request', (request) => {
      if (/\/auth\/login(?:\?|$)/.test(new URL(request.url()).pathname + new URL(request.url()).search)) requests += 1;
    });
    await page.goto('/login');
    await page.locator('#email').fill('bad-email');
    await page.locator('#password').fill('x');
    await page.locator('form').first().locator('button[type="submit"]').click();
    await expect(page.getByText('بريد إلكتروني غير صالح', { exact: true })).toBeVisible();
    expect(requests).toBe(0);
  });

  test('recovery form accepts an email-shaped value without navigating away', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.locator('#email').fill('e2e@example.com');
    await expect(page.locator('#email')).toHaveValue('e2e@example.com');
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('session-expired and OAuth error query states remain isolated', async ({ page }) => {
    await page.goto('/login?reason=session_expired');
    await expect(page.getByText(/انتهت جلستك/)).toBeVisible();
    await page.goto('/login?error=google_auth_failed');
    await expect(page.getByText(/تعذّر تسجيل الدخول باستخدام Google/)).toBeVisible();
    await expect(page.getByText(/انتهت جلستك/)).toHaveCount(0);
  });
});
