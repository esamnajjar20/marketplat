import { describe, expect, it } from 'vitest';
import { getSafeAuthRedirect } from '../safe-auth-redirect';

describe('getSafeAuthRedirect', () => {
  it('accepts safe local routes and preserves query/hash state', () => {
    expect(getSafeAuthRedirect('/products/product-1')).toBe('/products/product-1');
    expect(getSafeAuthRedirect('/search?q=phone&page=2#results')).toBe('/search?q=phone&page=2#results');
  });

  it('uses the first value from repeated router parameters', () => {
    expect(getSafeAuthRedirect(['/account', 'https://evil.example'])).toBe('/account');
  });

  it.each([undefined, [], '', '/', 'x', 'https://evil.example', '//evil.example/path', '/\\evil.example', '/account\\..\\login', '/login', '/login?next=/account', '/login/reset', '/register', '/register/step-2', '/account\nadmin', '/account\u0000x', '/account<x>', 'a'.repeat(2049)])(
    'rejects unsafe or unusable redirect %s', (candidate) => {
      expect(getSafeAuthRedirect(candidate as string | string[] | undefined)).toBeNull();
    },
  );

  it('does not reject an ordinary route merely because a query mentions login', () => {
    expect(getSafeAuthRedirect('/account?returnTo=/login')).toBe('/account?returnTo=/login');
  });
});
