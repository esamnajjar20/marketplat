/**
 * __tests__/security/xss-redirect.test.ts
 *
 * Security-focused tests:
 *  - parseApiError: XSS prevention (HTML stripping in backend messages)
 *  - parseApiError: Information leakage prevention (5xx, 401 never leak backend detail)
 *  - parseApiError: Oversized message prevention (200-char cap)
 *  - getSafeRedirectPath: Open-redirect prevention (SEC-04)
 *  - middleware: Role cookie injection (SEC-05)
 */
import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { parseApiError } from '@/lib/errorParser';
import { getSafeRedirectPath } from '@/lib/cookies';

// ── Helper ────────────────────────────────────────────────────────

function makeAxiosError(status: number, message?: string): AxiosError {
  const response = {
    status,
    statusText: String(status),
    data:    message !== undefined ? { message } : {},
    headers: new AxiosHeaders(),
    config:  { headers: new AxiosHeaders() } as AxiosError['config'],
  };
  const err = new AxiosError(
    'Request failed',
    String(status),
    { headers: new AxiosHeaders() } as AxiosError['config'],
    {},
    response as AxiosError['response'],
  );
  return err;
}

// ── XSS Prevention via errorParser ───────────────────────────────

describe('SEC: XSS prevention in API error messages', () => {
  it('strips <script> tags from 400 backend message', () => {
    const err = makeAxiosError(400, '<script>alert("xss")</script>بيانات خاطئة');
    const result = parseApiError(err);
    expect(result.message).not.toContain('<script>');
    expect(result.message).not.toContain('alert');
    expect(result.message).toContain('بيانات خاطئة');
  });

  it('strips <img onerror> XSS vector from 403 message', () => {
    const err = makeAxiosError(403, '<img src=x onerror=alert(1)>غير مصرح');
    const result = parseApiError(err);
    expect(result.message).not.toContain('<img');
    expect(result.message).not.toContain('onerror');
    expect(result.message).toContain('غير مصرح');
  });

  it('strips <a href=javascript:> from 404 message', () => {
    const err = makeAxiosError(404, '<a href="javascript:void(0)">غير موجود</a>');
    const result = parseApiError(err);
    expect(result.message).not.toContain('<a');
    expect(result.message).not.toContain('javascript:');
    expect(result.message).toContain('غير موجود');
  });

  it('strips nested/malformed HTML from 422 message', () => {
    const err = makeAxiosError(422, '<<b>strong>مطلوب</b></b>');
    expect(parseApiError(err).message).not.toContain('<b>');
  });

  it('strips HTML even from non-standard attributes', () => {
    const err = makeAxiosError(400, '<div style="display:none">خطأ</div>');
    const r = parseApiError(err);
    expect(r.message).not.toContain('<div');
    expect(r.message).not.toContain('style=');
    expect(r.message).toContain('خطأ');
  });
});

// ── Information Leakage Prevention ───────────────────────────────

describe('SEC: Information leakage prevention', () => {
  it('5xx: never exposes internal path information', () => {
    const err = makeAxiosError(500, 'Internal error at /src/modules/auth/auth.service.ts:42');
    const result = parseApiError(err);
    expect(result.message).not.toContain('/src');
    expect(result.message).not.toContain('.ts:42');
    expect(result.message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
  });

  it('5xx: never exposes stack traces', () => {
    const err = makeAxiosError(500, 'Error: Cannot read property at Object.<anonymous> (server.js:12)');
    const result = parseApiError(err);
    expect(result.message).not.toContain('at Object');
    expect(result.message).not.toContain('server.js');
  });

  it('5xx: never exposes database errors', () => {
    const err = makeAxiosError(500, 'PostgreSQL: relation "users" does not exist');
    const result = parseApiError(err);
    expect(result.message).not.toContain('PostgreSQL');
    expect(result.message).not.toContain('relation');
    expect(result.message).not.toContain('users');
  });

  it('5xx: never exposes SECRET environment variables', () => {
    const err = makeAxiosError(500, 'JWT_SECRET=super-secret-key-123');
    const result = parseApiError(err);
    expect(result.message).not.toContain('JWT_SECRET');
    expect(result.message).not.toContain('super-secret-key-123');
  });

  it('401: never exposes JWT token details', () => {
    const err = makeAxiosError(401, 'JWT expired at 2024-01-01T00:00:00Z, issued at 2023-12-31');
    const result = parseApiError(err);
    expect(result.message).not.toContain('JWT');
    expect(result.message).not.toContain('expired at');
    expect(result.message).toBe('انتهت جلستك، يرجى تسجيل الدخول مجدداً');
  });

  it('401: never exposes session ID or user ID', () => {
    const err = makeAxiosError(401, 'Session sess_abc123xyz not found for user user_456');
    const result = parseApiError(err);
    expect(result.message).not.toContain('sess_abc123xyz');
    expect(result.message).not.toContain('user_456');
  });

  it('message is capped at 200 chars (oversized message prevention)', () => {
    const err = makeAxiosError(400, 'ع'.repeat(500));
    expect(parseApiError(err).message.length).toBeLessThanOrEqual(200);
  });

  it('message cap applies to HTML-stripped content', () => {
    const htmlWrapped = '<b>' + 'x'.repeat(500) + '</b>';
    const err = makeAxiosError(400, htmlWrapped);
    expect(parseApiError(err).message.length).toBeLessThanOrEqual(200);
  });
});

// ── Open-Redirect Prevention (SEC-04) ────────────────────────────

describe('SEC-04: Open-redirect prevention in getSafeRedirectPath', () => {
  // Classic open-redirect payloads
  const maliciousInputs = [
    'https://evil.com',
    'http://evil.com/phishing',
    '//evil.com',
    '//evil.com/steal-credentials',
    'javascript:alert(document.cookie)',
    'javascript:window.location="https://evil.com"',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    // Encoded variants
    'http%3A%2F%2Fevil.com',
    '%2F%2Fevil.com',
    // Absolute with path
    'https://evil.com/dashboard',
    'http://evil.com:8080/admin',
  ];

  maliciousInputs.forEach((input) => {
    it(`rejects "${input.slice(0, 40)}..."`, () => {
      const result = getSafeRedirectPath(input);
      expect(result).toBe('/dashboard');
      expect(result).not.toContain('evil.com');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('data:');
    });
  });

  // Valid relative paths must be allowed
  const validPaths = [
    '/',
    '/dashboard',
    '/my-ads',
    '/settings/profile',
    '/ads/create',
    '/search?q=laptop&city=%D8%BA%D8%B2%D8%A9',
    '/categories/electronics',
    '/profile/user-123',
    '/admin/dashboard',
  ];

  validPaths.forEach((path) => {
    it(`allows valid path "${path}"`, () => {
      expect(getSafeRedirectPath(path)).toBe(path);
    });
  });

  it('uses custom fallback for rejected URL', () => {
    expect(getSafeRedirectPath('https://evil.com', '/home')).toBe('/home');
  });

  it('returns fallback for null (no crash)', () => {
    expect(() => getSafeRedirectPath(null)).not.toThrow();
    expect(getSafeRedirectPath(null)).toBe('/dashboard');
  });

  it('returns fallback for undefined', () => {
    expect(getSafeRedirectPath(undefined)).toBe('/dashboard');
  });
});

// ── Auth-page → already-logged-in redirect doesn't leak info ─────

describe('SEC: Error messages do not leak user-facing info', () => {
  it('network error returns generic Arabic message with no technical details', () => {
    const networkErr = new AxiosError('Network Error', 'ERR_NETWORK', {
      headers: new AxiosHeaders(),
    } as AxiosError['config']);

    const result = parseApiError(networkErr);
    expect(result.message).not.toContain('ERR_NETWORK');
    expect(result.message).not.toContain('Network Error');
    expect(result.statusCode).toBe(0);
  });

  it('non-Axios Error does not expose stack trace in message', () => {
    const err = new Error('Unexpected internal failure');
    err.stack = 'Error: Unexpected internal failure\n    at Function.process (node:internal/process:123)';
    const result = parseApiError(err);
    // The message is taken from err.message, not the stack
    expect(result.message).not.toContain('node:internal');
    expect(result.message).not.toContain('at Function');
  });
});
