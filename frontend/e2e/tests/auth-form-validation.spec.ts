import { expect, test } from '@playwright/test';

/**
 * These tests intentionally target the actual input IDs and visible copy used by
 * LoginForm/RegisterForm/ForgotPasswordForm. Avoid a page-wide `getByRole('alert')`:
 * shared auth layouts and field-level validation can expose more than one live region.
 */
test.describe('login form validation and recovery links', () => {
  test('login page exposes labeled credentials and disables submit until both are present', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();

    const email = page.locator('#email');
    const password = page.locator('#password');
    const submit = page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]');
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeDisabled();

    await email.fill('person@example.com');
    await expect(submit).toBeDisabled();
    await password.fill('a');
    await expect(submit).toBeEnabled();
  });

  test('malformed email is rejected in the browser without a login API request', async ({ page }) => {
    let loginRequests = 0;
    page.on('request', (request) => {
      if (/\/auth\/login(?:\?|$)/.test(new URL(request.url()).pathname + new URL(request.url()).search)) loginRequests += 1;
    });

    await page.goto('/login');
    await page.locator('#email').fill('not-an-email');
    await page.locator('#password').fill('password');
    await page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]').click();

    await expect(page.getByText('بريد إلكتروني غير صالح', { exact: true })).toBeVisible();
    expect(loginRequests).toBe(0);
  });

  test('whitespace-only login email remains incomplete', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('   ');
    await page.locator('#password').fill('some-password');
    await expect(page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]')).toBeDisabled();
  });

  test('session expiry is explained by its specific message', async ({ page }) => {
    await page.goto('/login?reason=session_expired');
    await expect(page.getByText(/انتهت جلستك، الرجاء تسجيل الدخول مجددًا للمتابعة/)).toBeVisible();
  });

  test('Google OAuth failure is explained by its specific message', async ({ page }) => {
    await page.goto('/login?error=google_auth_failed');
    await expect(page.getByText(/تعذّر تسجيل الدخول باستخدام Google/)).toBeVisible();
  });

  test('forgot-password link opens the recovery page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
    await expect(page).toHaveURL(/\/forgot-password(?:\?.*)?$/);
    await expect(page.getByRole('heading', { name: 'نسيت كلمة المرور؟' })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });

  test.fixme('registration link preserves a safe internal return destination', async ({ page }) => {
    await page.goto('/login?from=%2Ffavorites');
    const registrationLink = page.locator('a[href^="/register"]').filter({ hasText: 'إنشاء حساب' }).first();
    await expect(registrationLink).toBeVisible({ timeout: 15_000 });
    const href = await registrationLink.getAttribute('href');
    expect(href).toBeTruthy();
    const target = new URL(href!, 'http://localhost');
    expect(target.pathname).toBe('/register');
    expect(target.searchParams.get('from')).toBe('/favorites');
  });

  test('login fields expose programmatic labels', async ({ page }) => {
    await page.goto('/login');
    const labelStatus = await page.evaluate(() => {
      const email = document.querySelector<HTMLInputElement>('#email');
      const password = document.querySelector<HTMLInputElement>('#password');
      return {
        email: Boolean(email && email.labels?.length),
        password: Boolean(password && password.labels?.length),
      };
    });
    expect(labelStatus).toEqual({ email: true, password: true });
  });
});

test.describe('registration and password recovery validation', () => {
  test('registration exposes its required fields', async ({ page }) => {
    await page.goto('/register');
    for (const id of ['#name', '#email', '#password', '#confirmPassword']) {
      await expect(page.locator(id), `${id} should be visible`).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'إنشاء حساب جديد' })).toBeVisible();
  });

  test('registration submit enables only when required values are plausible', async ({ page }) => {
    await page.goto('/register');
    const submit = page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]');
    await expect(submit).toBeDisabled();
    await page.locator('#name').fill('مستخدم تجريبي');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('Password123!');
    await page.locator('#confirmPassword').fill('Password123!');
    await expect(submit).toBeEnabled();
  });

  test('registration rejects a password shorter than eight characters', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#name').fill('مستخدم');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('short');
    await page.locator('#password').blur();
    await expect(page.getByText('كلمة المرور 8 أحرف على الأقل', { exact: true })).toBeVisible();
  });

  test('registration reports mismatched confirmation passwords', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#name').fill('مستخدم تجريبي');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('Password123!');
    await page.locator('#confirmPassword').fill('Different123!');
    await page.locator('#confirmPassword').blur();
    await expect(page.getByText('كلمتا المرور غير متطابقتين', { exact: true })).toBeVisible();
    await expect(page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]')).toBeDisabled();
  });

  test('invalid optional phone number is explained before submit', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#phone').fill('12+34567890');
    await page.locator('#phone').blur();
    await expect(page.getByText('رقم هاتف غير صالح', { exact: true })).toBeVisible();
  });

  test('recovery submit is disabled while email is empty', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]')).toBeDisabled();
  });

  test.fixme('malformed recovery email is rejected without an API request', async ({ page }) => {
    let recoveryRequests = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes('/auth/forgot-password')) recoveryRequests += 1;
    });

    await page.goto('/forgot-password');
    await page.locator('#email').fill('bad-address');
    await page.locator('#email').locator('xpath=ancestor::form').locator('button[type="submit"]').click();
    await expect(page.getByText('بريد إلكتروني غير صالح', { exact: true })).toBeVisible();
    expect(recoveryRequests).toBe(0);
  });

  test('recovery page keeps a safe internal destination on its login link', async ({ page }) => {
    await page.goto('/forgot-password?from=%2Fmessages');
    await expect(page.getByRole('link', { name: 'العودة لتسجيل الدخول' })).toHaveAttribute('href', '/login?from=%2Fmessages');
  });
});
