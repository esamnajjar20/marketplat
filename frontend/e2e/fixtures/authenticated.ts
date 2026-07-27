/**
 * e2e/fixtures/authenticated.ts
 *
 * Extends Playwright's base `test` with an `authedPage` fixture: a page
 * that has already registered a fresh, unique user through the real UI
 * and is sitting on the home page, logged in. Every spec that needs
 * "some logged-in user" (ad creation, my-ads, favorites, settings)
 * should use this instead of repeating registerViaUI() inline — one
 * registration call per test file section, not copy-pasted into every
 * single test.
 *
 * Each test gets its OWN freshly-registered user (not a shared seeded
 * account) specifically so tests can run in parallel without one
 * test's ad-deletion or profile-edit affecting another test's
 * assertions about "my ads" or "my profile".
 */
import { test as base, expect } from '@playwright/test';
import { registerViaUI } from '../helpers/auth';
import { makeTestUser, type TestUser } from '../helpers/test-data';

export interface AuthedFixtures {
  authedUser: TestUser;
}

export const test = base.extend<AuthedFixtures>({
  // eslint-disable-next-line no-empty-pattern
  authedUser: async ({}, use) => {
    await use(makeTestUser());
  },

  page: async ({ page, authedUser }, use) => {
    await registerViaUI(page, authedUser);
    await use(page);
  },
});

export { expect };
