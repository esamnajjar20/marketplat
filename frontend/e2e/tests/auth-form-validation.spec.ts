import { expect, test } from '@playwright/test';

test.describe('login form validation and recovery links', () => {
  test('the login submit button starts disabled until required fields are entered', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeDisabled();
    await page.getByLabel('البريد الإلكتروني').fill('person@example.com');
    await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeDisabled();
    await page.getByLabel('كلمة المرور').fill('some-password');
    await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeEnabled();
  });

  test('an invalid email is rejected client-side before a login request', async ({ page }) => {
    let authRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/auth/login')) authRequests += 1;
    });
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill('not-an-email');
    await page.getByLabel('كلمة المرور').fill('password');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page.getByText('بريد إلكتروني غير صالح')).toBeVisible();
    expect(authRequests).toBe(0);
  });

  test('session expiration is explained on the login page', async ({ page }) => {
    await page.goto('/login?reason=session_expired');
    await expect(page.getByRole('alert')).toContainText('انتهت جلستك');
  });

  test('Google login failure is explained on the login page', async ({ page }) => {
    await page.goto('/login?error=google_auth_failed');
    await expect(page.getByRole('alert')).toContainText('تعذّر تسجيل الدخول باستخدام Google');
  });

  test('the forgot-password link opens the recovery form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('heading', { name: 'نسيت كلمة المرور؟' })).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  });

  test('the login page preserves a safe return destination when linking to registration', async ({ page }) => {
    await page.goto('/login?from=%2Ffavorites');
    await page.getByRole('link', { name: 'إنشاء حساب' }).click();
    await expect(page).toHaveURL(/\/register\?from=%2Ffavorites/);
  });
});

test.describe('registration and password recovery validation', () => {
  test('registration displays required identity and password fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel('الاسم الكامل')).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
    await expect(page.getByLabel('كلمة المرور')).toBeVisible();
    await expect(page.getByLabel('تأكيد كلمة المرور')).toBeVisible();
  });

  test('registration submit remains disabled until required fields are plausible', async ({ page }) => {
    await page.goto('/register');
    const submit = page.getByRole('button', { name: 'إنشاء الحساب', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('الاسم الكامل').fill('مستخدم تجريبي');
    await page.getByLabel('البريد الإلكتروني').fill('test@example.com');
    await page.getByLabel('كلمة المرور').fill('Password123!');
    await page.getByLabel('تأكيد كلمة المرور').fill('Password123!');
    await expect(submit).toBeEnabled();
  });

  test('the recovery form rejects a malformed email without sending a request', async ({ page }) => {
    let recoveryRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/auth/forgot-password')) recoveryRequests += 1;
    });
    await page.goto('/forgot-password');
    await page.getByLabel('البريد الإلكتروني').fill('bad-address');
    await page.getByRole('button', { name: 'إرسال رابط الاسترداد' }).click();
    await expect(page.getByText('بريد إلكتروني غير صالح')).toBeVisible();
    expect(recoveryRequests).toBe(0);
  });

  test('the recovery page returns to login while preserving a safe destination', async ({ page }) => {
    await page.goto('/forgot-password?from=%2Fmessages');
    await expect(page.getByRole('link', { name: 'العودة لتسجيل الدخول' })).toHaveAttribute('href', '/login?from=%2Fmessages');
  });
});
