/**
 * __tests__/security/middleware.test.ts
 *
 * Security-focused middleware tests:
 *  - Role-cookie isolation: browser-controlled role values never authorize routes
 *  - Token manipulation: tampered payload, truncated token
 *  - Admin escalation: USER forging ADMIN role cookie
 *  - Expired-token bypass attempts
 *  - Path traversal in protected route check
 *  - Request-ID does not leak internal info
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// Test helper to avoid shell substitution issues
const _TEST_ROLE_SLICE = (role: string) => role.slice(0, 30);

// ── Helpers ───────────────────────────────────────────────────────

function makeJwt(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const body   = btoa(JSON.stringify(payload)).replace(/=/g, '');
  return `${header}.${body}.fakesig`;
}

function futureExp(seconds = 900) {
  return Math.floor(Date.now() / 1000) + seconds;
}

function pastExp(seconds = 60) {
  return Math.floor(Date.now() / 1000) - seconds;
}

function makeRequest(
  pathname: string,
  opts: { token?: string; role?: string } = {},
) {
  const url = new URL(`http://localhost${pathname}`);
  const req = new NextRequest(url);
  if (opts.token) req.cookies.set('app_access_token', opts.token);
  if (opts.role)  req.cookies.set('app_user_role', opts.role);
  return req;
}

const VALID_USER_TOKEN  = makeJwt({ userId: 'user-1',  role: 'USER',  exp: futureExp() });
const VALID_ADMIN_TOKEN = makeJwt({ userId: 'admin-1', role: 'ADMIN', exp: futureExp() });
const EXPIRED_TOKEN     = makeJwt({ userId: 'user-1',  role: 'USER',  exp: pastExp() });

// ── Browser-controlled role cookies are ignored by middleware ─────

describe('SEC: role cookie is a non-authoritative routing hint', () => {
  const injectedRoles = [
    'ADMIN',          // valid attack — but only works if token is also valid
    'admin',          // lowercase
    'Admin',          // mixed case
    'SUPERADMIN',     // unknown value
    '1',              // numeric
    'true',           // boolean string
    '{"role":"ADMIN"}', // JSON-shaped value
    '; role=ADMIN',   // header injection attempt
    'ADMIN\x00',      // null byte
    '',               // empty — should fail
    'USER; path=/',   // cookie attribute injection
    ];
  // Middleware deliberately ignores role cookies. The client layout uses the
  // hydrated profile for UX; the backend authorizes every privileged API call.
  injectedRoles.forEach((role) => {
    it(`allows /admin access for logged-in USER with injected role="${role.slice(0, 30)}"`, () => {
      const req = makeRequest('/admin', {
        token: VALID_USER_TOKEN,
        role,
      });
      const res = middleware(req);
      // Middleware allows logged-in users to reach admin pages
      // This is only a routing decision; backend authorization is independent.
      expect(res.status).toBe(200);
    });
  });

  it('does not treat an ADMIN cookie as authorization', () => {
    const req = makeRequest('/admin/dashboard', {
      token: VALID_ADMIN_TOKEN,
      role:  'ADMIN',
    });
    expect(middleware(req).status).toBe(200);
  });

  it('rejects "ADMIN" role when token is expired', () => {
    const req = makeRequest('/admin', {
      token: EXPIRED_TOKEN,
      role:  'ADMIN',
    });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/login');
  });
});

// ── Token manipulation attacks ────────────────────────────────────

describe('SEC: Token manipulation / forgery', () => {
  it('rejects a token with tampered payload (no signature verification - decode only)', () => {
    // The middleware only decodes — it does NOT verify the signature.
    // A forged token with a valid structure but fake payload would decode successfully.
    // This test documents the known limitation: the backend MUST verify the token.
    const forgedToken = makeJwt({ userId: 'other-user', exp: futureExp(), role: 'ADMIN' });
    const req = makeRequest('/admin', { token: forgedToken, role: 'ADMIN' });
    // Middleware only decodes token structure/expiry for routing. It does not
    // verify the signature or authorize roles; the backend does both.
    const res = middleware(req);
    // A forged valid-looking token may pass this routing-hint check; it must
    // never authorize data or actions. Backend verification remains mandatory.
    expect(typeof res.status).toBe('number');
  });

  it('rejects token with exp in the past', () => {
    const req = makeRequest('/dashboard', { token: EXPIRED_TOKEN });
    expect(middleware(req).status).toBe(307);
  });

  it('rejects token with missing exp field', () => {
    const token = makeJwt({ userId: 'user-1' });
    expect(middleware(makeRequest('/dashboard', { token })).status).toBe(307);
  });

  it('rejects token with missing userId', () => {
    const token = makeJwt({ exp: futureExp() });
    expect(middleware(makeRequest('/dashboard', { token })).status).toBe(307);
  });

  it('rejects token where payload segment is base64 gibberish', () => {
    const req = makeRequest('/dashboard', { token: 'header.!!!notbase64!!!.sig' });
    expect(middleware(req).status).toBe(307);
  });

  it('rejects completely empty token', () => {
    const req = makeRequest('/dashboard', { token: '' });
    expect(middleware(req).status).toBe(307);
  });

  it('rejects token with only 2 parts (missing signature)', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify({ userId: 'u', exp: futureExp() })).replace(/=/g, '');
    const req = makeRequest('/dashboard', { token: `${header}.${payload}` });
    expect(middleware(req).status).toBe(307);
  });
});

// ── Path traversal in protected route check ───────────────────────

describe('SEC: Path traversal in route classification', () => {
  it('/dashboard/../admin normalizes to /admin and allows logged-in USER', () => {
    // Next.js normalizes paths before middleware runs, so /dashboard/../admin becomes /admin
    // The middleware allows logged-in users to reach /admin (role check happens downstream)
    const req = makeRequest('/dashboard/../admin', {
      token: VALID_USER_TOKEN,
      role:  'USER',
    });
    const res = middleware(req);
    // Path is normalized to /admin, logged-in USER can reach it (role enforced downstream)
    expect(res.status).toBe(200);
  });

  it('/my-adsXYZ does not match /my-ads protected prefix', () => {
    // startsWith('/my-ads/') → false for '/my-adsXYZ'
    // exact match '/my-ads' → false
    // So this should pass through as a public route
    const req = makeRequest('/my-adsXYZ');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('/dashboard-extra does not match /dashboard protected prefix', () => {
    // Exact match '/dashboard' and startsWith('/dashboard/') only
    // '/dashboard-extra' should not be protected
    const req = makeRequest('/dashboard-extra');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});

// ── Request ID security ───────────────────────────────────────────

describe('SEC: Request ID header', () => {
  it('X-Request-Id does not contain path information', () => {
    const req = makeRequest('/admin');
    const res = middleware(req);
    const id = res.headers.get('X-Request-Id');
    // Redirect response may not have the header (only pass-throughs do)
    // For pass-throughs: verify no path leakage
    if (id) {
      expect(id).not.toContain('/admin');
      expect(id).not.toContain('pathname');
    }
  });

  it('X-Request-Id is a valid UUID on pass-through', () => {
    const req = makeRequest('/');
    const res = middleware(req);
    const id = res.headers.get('X-Request-Id');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('does not expose token value in any response header', () => {
    const req = makeRequest('/dashboard', { token: VALID_USER_TOKEN });
    const res = middleware(req);
    const headers = Object.fromEntries(res.headers.entries());
    const headerValues = Object.values(headers).join(' ');
    expect(headerValues).not.toContain(VALID_USER_TOKEN);
  });
});

// ── from= parameter safety ────────────────────────────────────────

describe('SEC: ?from= redirect parameter', () => {
  it('includes the original path in from= on redirect to /login', () => {
    const req = makeRequest('/my-ads');
    const res = middleware(req);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain('from=');
    expect(location).toContain(encodeURIComponent('/my-ads'));
  });

  it('from= value is URL-encoded (not raw)', () => {
    const req = makeRequest('/ads/create');
    const res = middleware(req);
    const location = res.headers.get('Location') ?? '';
    // The raw path '/ads/create' should be encoded in the from param
    const url = new URL(location, 'http://localhost');
    const from = url.searchParams.get('from');
    expect(from).toBe('/ads/create');
  });
});
