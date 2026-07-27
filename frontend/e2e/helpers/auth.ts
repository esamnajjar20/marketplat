/**
 * e2e/helpers/auth.ts
 *
 * Real registration/login flows through the actual UI — not API
 * shortcuts. Deliberately going through the browser rather than
 * seeding a logged-in state directly matters here: this app's most
 * fragile-in-the-past area was exactly the auth/cookie layer (silent
 * token-refresh races, cookie desync — see marketplace-v10's own
 * commit history / audit notes), so bypassing the real login flow
 * would skip testing the part most likely to regress.
 */
import { type Page, expect } from '@playwright/test';
import type { TestUser } from './test-data';

/** Registers a new user through the real /register form and waits for
 * the resulting redirect to the home page (RegisterForm's onSuccess
 * behavior), confirming the session actually took effect. */
export async function registerViaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto('/register');

  await page.getByLabel('الاسم الكامل').fill(user.name);
  await page.getByLabel('البريد الإلكتروني').fill(user.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();

  // A successful register redirects home and the header switches from
  // login/register buttons to the authenticated UserMenu — waiting on
  // that swap (rather than just the URL) confirms the session cookie
  // actually landed, not just that the client-side redirect fired.
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'قائمة المستخدم' })).toBeVisible();
}

/** Logs in an existing user through the real /login form. */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');

  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

  await expect(page.getByRole('button', { name: 'قائمة المستخدم' })).toBeVisible();
}

/** Logs out via the UserMenu dropdown — the real user-facing path,
 * exercising the same logout mutation covered in UserMenu.test.tsx but
 * end-to-end through a real cookie-clearing round trip this time. */
export async function logoutViaUI(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'قائمة المستخدم' }).click();
  await page.getByText('تسجيل الخروج').click();

  await expect(page.getByRole('link', { name: 'تسجيل الدخول' })).toBeVisible();
}
