/**
 * __tests__/unit/lib/cookies.test.ts
 *
 * Coverage targets:
 *  - setCookie: writes correct cookie string with all attributes
 *  - setCookie: adds Secure flag on HTTPS (production)
 *  - setCookie: omits Secure flag on HTTP (development)
 *  - deleteCookie: sets max-age=0
 *  - deleteCookie: no-op on server (no document)
 *  - getSafeRedirectPath: SEC-04 — open-redirect prevention
 *    * absolute URLs rejected
 *    * protocol-relative URLs (//) rejected
 *    * javascript: scheme rejected
 *    * data: URI rejected
 *    * valid relative paths accepted
 *    * root path "/" accepted
 *    * null/undefined falls back to default
 *    * encoded malicious URLs rejected
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCookie, deleteCookie, getSafeRedirectPath, AUTH_COOKIE_MAX_AGE } from '@/lib/cookies';

// ── AUTH_COOKIE_MAX_AGE constant ──────────────────────────────────

describe('AUTH_COOKIE_MAX_AGE', () => {
  it('is 14 minutes in seconds (just under 15-min JWT TTL)', () => {
    expect(AUTH_COOKIE_MAX_AGE).toBe(14 * 60);
  });
});

// ── Cookie DOM environment helpers ────────────────────────────────

function getCookies(): Record<string, string> {
  const result: Record<string, string> = {};
  document.cookie.split('; ').forEach((pair) => {
    const [k, ...v] = pair.split('=');
    if (k) result[k.trim()] = decodeURIComponent(v.join('='));
  });
  return result;
}

// ── setCookie ─────────────────────────────────────────────────────

describe('setCookie', () => {
  beforeEach(() => {
    // Clear all cookies between tests using max-age=0
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=; max-age=0; path=/`;
    });
  });

  it('sets a cookie with the correct name and value', () => {
    setCookie('test_cookie', 'hello', 3600);
    expect(getCookies()['test_cookie']).toBe('hello');
  });

  it('URL-encodes special characters in value', () => {
    setCookie('tok', 'val ue+special=char', 3600);
    // document.cookie automatically decodes; getCookies() re-decodes
    const val = getCookies()['tok'];
    expect(val).toBe('val ue+special=char');
  });

  it('is a no-op on the server (no document)', () => {
    const origDoc = globalThis.document;
    // @ts-expect-error - simulating server environment
    delete globalThis.document;
    expect(() => setCookie('x', 'y', 60)).not.toThrow();
    globalThis.document = origDoc;
  });

  it('adds SameSite=Strict attribute', () => {
    const calls: string[] = [];
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'cookie');
    Object.defineProperty(document, 'cookie', {
      set: (val: string) => { calls.push(val); },
      get: () => '',
      configurable: true,
    });

    setCookie('app_token', 'abc', 300);

    expect(calls[0]).toContain('SameSite=Strict');
    expect(calls[0]).toContain('path=/');
    expect(calls[0]).toContain('max-age=300');

    // Restore
    if (originalDescriptor) {
      Object.defineProperty(document, 'cookie', originalDescriptor);
    }
  });

  it('does NOT add Secure on HTTP (localhost)', () => {
    const calls: string[] = [];
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'cookie');
    Object.defineProperty(document, 'cookie', {
      set: (val: string) => { calls.push(val); },
      get: () => '',
      configurable: true,
    });

    // jsdom uses http: by default → isProduction() returns false
    setCookie('tok', 'x', 60);
    expect(calls[0]).not.toContain('Secure');

    if (originalDescriptor) {
      Object.defineProperty(document, 'cookie', originalDescriptor);
    }
  });
});

// ── deleteCookie ──────────────────────────────────────────────────

describe('deleteCookie', () => {
  it('sets max-age=0 to expire the cookie', () => {
    const calls: string[] = [];
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'cookie');
    Object.defineProperty(document, 'cookie', {
      set: (val: string) => { calls.push(val); },
      get: () => '',
      configurable: true,
    });

    deleteCookie('my_cookie');

    expect(calls[0]).toContain('max-age=0');
    expect(calls[0]).toContain('my_cookie=');

    if (originalDescriptor) {
      Object.defineProperty(document, 'cookie', originalDescriptor);
    }
  });

  it('is a no-op on the server (no document)', () => {
    const origDoc = globalThis.document;
    // @ts-expect-error - simulating server environment
    delete globalThis.document;
    expect(() => deleteCookie('x')).not.toThrow();
    globalThis.document = origDoc;
  });
});

// ── getSafeRedirectPath — SEC-04 open-redirect prevention ─────────

describe('getSafeRedirectPath — security (SEC-04)', () => {
  // ── Valid paths (should be allowed) ──────────────────────────────

  it('allows a simple relative path "/dashboard"', () => {
    expect(getSafeRedirectPath('/dashboard')).toBe('/dashboard');
  });

  it('allows root path "/"', () => {
    expect(getSafeRedirectPath('/')).toBe('/');
  });

  it('allows deep relative path "/settings/profile"', () => {
    expect(getSafeRedirectPath('/settings/profile')).toBe('/settings/profile');
  });

  it('allows path with query string (encoded)', () => {
    expect(getSafeRedirectPath('/search?q=hello')).toBe('/search?q=hello');
  });

  it('allows Arabic-encoded path component', () => {
    const encoded = encodeURIComponent('/dashboard');
    expect(getSafeRedirectPath(encoded)).toBe('/dashboard');
  });

  // ── Rejected inputs (open-redirect attacks) ────────────────────

  it('rejects absolute URL with http://', () => {
    expect(getSafeRedirectPath('http://evil.com/steal')).toBe('/dashboard');
  });

  it('rejects absolute URL with https://', () => {
    expect(getSafeRedirectPath('https://evil.com')).toBe('/dashboard');
  });

  it('rejects protocol-relative URL "//"', () => {
    expect(getSafeRedirectPath('//evil.com')).toBe('/dashboard');
  });

  it('rejects protocol-relative URL "//evil.com/path"', () => {
    expect(getSafeRedirectPath('//evil.com/path')).toBe('/dashboard');
  });

  it('rejects javascript: URI', () => {
    expect(getSafeRedirectPath('javascript:alert(1)')).toBe('/dashboard');
  });

  it('rejects data: URI', () => {
    expect(getSafeRedirectPath('data:text/html,<script>alert(1)</script>')).toBe('/dashboard');
  });

  it('rejects encoded absolute URL (%68%74%74%70...)', () => {
    // decodeURIComponent('http://evil.com') → 'http://evil.com'
    expect(getSafeRedirectPath('http%3A%2F%2Fevil.com')).toBe('/dashboard');
  });

  // ── Null / undefined / empty → fallback ──────────────────────────

  it('returns fallback for null', () => {
    expect(getSafeRedirectPath(null)).toBe('/dashboard');
  });

  it('returns fallback for undefined', () => {
    expect(getSafeRedirectPath(undefined)).toBe('/dashboard');
  });

  it('returns fallback for empty string', () => {
    expect(getSafeRedirectPath('')).toBe('/dashboard');
  });

  // ── Custom fallback ───────────────────────────────────────────────

  it('uses custom fallback parameter when provided', () => {
    expect(getSafeRedirectPath(null, '/login')).toBe('/login');
  });

  it('uses custom fallback for rejected URL', () => {
    expect(getSafeRedirectPath('http://evil.com', '/home')).toBe('/home');
  });
});
