/**
 * e2e/fixtures/admin-authenticated.ts
 *
 * Extends the base test with a page already logged in as the seeded
 * E2E admin account (see backend-v9/src/scripts/seedE2E.ts — this
 * fixture depends on that script having been run against the E2E
 * database first; see e2e/README.md for setup order). Unlike
 * `authedPage`, this reuses the SAME seeded admin across all admin
 * tests rather than registering a fresh one per test — there is no
 * self-serve way to become an admin through the UI (by design), so a
 * fresh admin can't be created per-test the way a regular user can.
 *
 * Tests using this fixture should avoid depending on the admin
 * account's state being pristine between runs (e.g. don't assert
 * "there are exactly 0 reports"), since the seeded admin is shared and
 * long-lived across the whole E2E suite's history, not reset per test.
 */
import { test as base, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/auth';
import { SEEDED_ADMIN } from './seed-data';

export const test = base.extend({
  page: async ({ page }, use) => {
    await loginViaUI(page, SEEDED_ADMIN.email, SEEDED_ADMIN.password);
    await use(page);
  },
});

export { expect };
