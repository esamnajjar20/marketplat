/**
 * اختبارات التحقق من شكل الجلسة المخزّنة.
 * تشغيل: npx vitest run src/features/auth/__tests__/session-storage.test.ts
 */
import { describe, expect, it } from 'vitest';
import { isPersistedSession, sessionExpiry } from '../session-storage';

describe('isPersistedSession', () => {
  it('accepts a valid session shape', () => {
    expect(
      isPersistedSession({
        accessToken: 'tok',
        csrfToken: null,
        expiresAt: Date.now() + 60_000,
        user: { id: 'u1', email: 'a@b.c', name: 'Test' },
      }),
    ).toBe(true);
  });

  it('rejects missing token or user fields', () => {
    expect(isPersistedSession(null)).toBe(false);
    expect(isPersistedSession({})).toBe(false);
    expect(
      isPersistedSession({
        accessToken: '',
        csrfToken: null,
        expiresAt: 1,
        user: { id: 'u1', email: 'a@b.c', name: 'Test' },
      }),
    ).toBe(false);
    expect(
      isPersistedSession({
        accessToken: 'tok',
        csrfToken: null,
        expiresAt: 1,
        user: { id: 'u1', email: 'a@b.c' },
      }),
    ).toBe(false);
  });
});

describe('sessionExpiry', () => {
  it('uses server expiresIn when valid', () => {
    const before = Date.now();
    const at = sessionExpiry(120);
    expect(at).toBeGreaterThanOrEqual(before + 120_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 120_000 + 50);
  });

  it('falls back when expiresIn missing', () => {
    const at = sessionExpiry(undefined);
    expect(at).toBeGreaterThan(Date.now());
  });
});
