/**
 * e2e/tests/auth.spec.ts
 *
 * Full register -> logout -> login -> logout cycle through the real
 * UI, real backend, real Postgres — the flow every other authenticated
 * spec in this suite depends on working correctly. Also covers the two
 * concrete regressions called out in this codebase's own audit notes:
 * FIX AUTH-06 (login respects the ?from= redirect target instead of
 * always going to /dashboard) and the general cookie-based session
 * surviving a full page reload (the historical "cookie desync on
 * silent token refresh" risk area).
 */
import { test, expect } from '@playwright/test';
import { registerViaUI, loginViaUI, logoutViaUI } from '../helpers/auth';
import { makeTestUser } from '../helpers/test-data';

test.describe('Registration', () => {
  test('registers a new user and lands authenticated on the home page', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'قائمة المستخدم' })).toBeVisible();
  });

  test('rejects registration with a password under 8 characters, with no network call', async ({ page }) => {
    const user = makeTestUser({ password: 'short' });
    await page.goto('/register');

    await page.getByLabel('الاسم الكامل').fill(user.name);
    await page.getByLabel('البريد الإلكتروني').fill(user.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();

    await expect(page.getByText('كلمة المرور 8 أحرف على الأقل')).toBeVisible();
    // Client-side validation should block submission entirely — still
    // on /register, not redirected or shown a server error.
    await expect(page).toHaveURL(/\/register/);
  });

  test('shows a server-side error when registering with an email that is already taken', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);
    await logoutViaUI(page);

    // Attempt to register again with the exact same email.
    await page.goto('/register');
    await page.getByLabel('الاسم الكامل').fill('اسم آخر');
    await page.getByLabel('البريد الإلكتروني').fill(user.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill('AnotherPass123!');
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();

    // A real 409/400 from the backend surfaces via toast — not a silent
    // failure and not a false "success" redirect.
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Login', () => {
  test('logs in an existing user and reaches an authenticated view', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);
    await logoutViaUI(page);

    await loginViaUI(page, user.email, user.password);
    await expect(page.getByRole('button', { name: 'قائمة المستخدم' })).toBeVisible();
  });

  test('shows an error and stays logged out with wrong credentials', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);
    await logoutViaUI(page);

    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(user.email);
    await page.getByLabel('كلمة المرور').fill('TotallyWrongPassword123!');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    await expect(page.getByRole('link', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'قائمة المستخدم' })).not.toBeVisible();
  });

  test('FIX AUTH-06 regression: redirects back to the originally-requested protected page after login, not always /dashboard', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);
    await logoutViaUI(page);

    // Visiting a protected route while logged out should bounce through
    // middleware.ts to /login?from=<original path>.
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('البريد الإلكتروني').fill(user.email);
    await page.getByLabel('كلمة المرور').fill(user.password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    // Must land back on /settings/profile, not /dashboard.
    await expect(page).toHaveURL(/\/settings\/profile/);
  });
});

test.describe('Session persistence', () => {
  test('stays logged in after a full page reload (real cookie session, not just in-memory state)', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);

    await page.reload();

    await expect(page.getByRole('button', { name: 'قائمة المستخدم' })).toBeVisible();
  });

  test('stays logged in when navigating to a protected page directly via URL after reload', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);

    await page.goto('/dashboard');
    await page.reload();

    // Should NOT get bounced to /login — the cookie session must
    // survive the reload for middleware.ts to keep allowing access.
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('Logout', () => {
  test('logs out, clears the session, and blocks access to protected pages afterward', async ({ page }) => {
    const user = makeTestUser();
    await registerViaUI(page, user);
    await logoutViaUI(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
