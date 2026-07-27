/**
 * e2e/helpers/test-data.ts
 *
 * Generates unique values per test invocation so parallel workers
 * hitting the same real, shared Postgres database don't collide on
 * unique constraints (User.email, User.phone) or produce ambiguous
 * assertions (two tests both creating an ad titled "Test Ad" makes
 * "find the ad I just created" unreliable once more than one exists).
 *
 * crypto.randomUUID() rather than Date.now() alone: two tests starting
 * in the same millisecond on different workers is a real collision
 * risk under parallel execution, not just a theoretical one.
 */
import { randomUUID } from 'crypto';

/** A unique, valid email for registering a throwaway test user. */
export function uniqueEmail(prefix = 'e2e-user'): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

/** A unique ad title — long enough to satisfy AdForm's 5-char minimum. */
export function uniqueAdTitle(prefix = 'إعلان اختبار'): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

/**
 * A valid Palestinian-format phone number per RegisterForm's
 * /^[0-9+]{9,15}$/ validation, unique enough per-run to avoid
 * User.phone's unique constraint colliding across parallel workers.
 * Real registration doesn't require phone (RegisterForm treats it as
 * optional), so most flows won't need this — only tests that
 * specifically exercise the phone field do.
 */
export function uniquePhone(): string {
  // +9705 + 8 more digits derived from a random UUID's digits, padded/
  // truncated to exactly 8 so the total length always satisfies the
  // regex regardless of how many digit characters randomUUID happens
  // to produce in the slice taken.
  const digits = randomUUID().replace(/\D/g, '').padEnd(8, '0').slice(0, 8);
  return `+9705${digits}`;
}

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/**
 * A complete, valid registration payload — meets both frontend
 * (RegisterForm.validate) and backend (registerSchema) requirements:
 * name >= 2 chars, valid email format, password >= 8 chars.
 */
export function makeTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    name: 'مستخدم اختبار',
    email: uniqueEmail(),
    password: 'TestPass123!',
    ...overrides,
  };
}
