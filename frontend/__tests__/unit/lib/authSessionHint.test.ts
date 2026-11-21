import { describe, expect, it } from 'vitest';
import { hasCookie, shouldSkipAnonymousRefresh } from '@/lib/authSessionHint';

describe('hasCookie', () => {
  it('finds a cookie with a value', () => {
    expect(hasCookie('a=1; app_has_session=1; b=2', 'app_has_session')).toBe(true);
  });
  it('ignores empty values and similarly named cookies', () => {
    expect(hasCookie('app_has_session=', 'app_has_session')).toBe(false);
    expect(hasCookie('x_app_has_session=1', 'app_has_session')).toBe(false);
  });
});

describe('shouldSkipAnonymousRefresh', () => {
  const base = { cookieString: '', hasPersistedUser: false, isNative: false };

  it('skips for a visitor with no session signals', () => {
    expect(shouldSkipAnonymousRefresh(base)).toBe(true);
  });
  it('does not skip when the session hint cookie exists', () => {
    expect(shouldSkipAnonymousRefresh({ ...base, cookieString: 'app_has_session=1' })).toBe(false);
  });
  it('does not skip when the middleware-mirrored hint cookie exists (backend cookie is httpOnly)', () => {
    expect(shouldSkipAnonymousRefresh({ ...base, cookieString: 'app_session_hint=1' })).toBe(false);
  });
  it('does not skip when an access token cookie exists', () => {
    expect(shouldSkipAnonymousRefresh({ ...base, cookieString: 'app_access_token=abc' })).toBe(false);
  });
  it('does not skip when a user is persisted (offline/restore flows)', () => {
    expect(shouldSkipAnonymousRefresh({ ...base, hasPersistedUser: true })).toBe(false);
  });
  it('never skips inside the native app', () => {
    expect(shouldSkipAnonymousRefresh({ ...base, isNative: true })).toBe(false);
  });
});
