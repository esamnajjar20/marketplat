/**
 * __tests__/unit/middleware/middleware.test.ts
 *
 * Coverage targets:
 *  - isProtected: all PROTECTED_PREFIXES + edit regex
 *  - isAdminRoute: /admin paths
 *  - isAuthPage: /login, /register, /forgot-password, /reset-password
 *  - decodeToken: valid JWT / malformed / expired
 *  - isTokenExpired: expired / valid / 10s buffer
 *  - middleware function:
 *    1. Auth page + logged-in → redirect /dashboard
 *    2. Protected route + no token → redirect /login?from=path
 *    3. Protected route + valid token → passes through
 *    4. Admin route + no token → redirect /login
 *    5. Admin route + USER role → redirect /dashboard
 *    6. Admin route + ADMIN role → passes through
 *    7. Public route → passes through (no redirect)
 *    8. Role cookie validation (SEC-05): unknown role treated as null
 *    9. Request-ID header is always set on pass-through
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// We test the middleware function directly — import it from the source.
// Because next/server is available in jsdom via vitest, this should work.
import { middleware } from '@/middleware';

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Build a minimal JWT with the given payload (HS256 header, no real signature).
 * Sufficient for the middleware's pure-decode usage (it does NOT verify signatures).
 */
function makeJwt(payload: object): string {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const body    = btoa(JSON.stringify(payload)).replace(/=/g, '');
  return `${header}.${body}.fakesig`;
}

function futureExp(secondsFromNow = 900): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

function pastExp(secondsAgo = 60): number {
  return Math.floor(Date.now() / 1000) - secondsAgo;
}

function makeRequest(
  pathname: string,
  opts: {
    token?: string | null;
    role?:  string | null;
  } = {},
): NextRequest {
  const url = new URL(`http://localhost${pathname}`);
  const req = new NextRequest(url);

  if (opts.token) {
    req.cookies.set('app_access_token', opts.token);
  }
  if (opts.role) {
    req.cookies.set('app_user_role', opts.role);
  }
  return req;
}

const VALID_TOKEN = makeJwt({ userId: 'user-1', exp: futureExp() });
const EXPIRED_TOKEN = makeJwt({ userId: 'user-1', exp: pastExp() });
const ADMIN_TOKEN = makeJwt({ userId: 'admin-1', exp: futureExp() });

// ── Public routes — no redirect ───────────────────────────────────

describe('middleware — public routes', () => {
  it('passes through / (homepage)', () => {
    const req = makeRequest('/');
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Location')).toBeNull();
  });

  it('passes through /ads/:id (ad detail)', () => {
    const req = makeRequest('/ads/clr123abc');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('passes through /search', () => {
    const req = makeRequest('/search?q=laptops');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('passes through /categories/:slug', () => {
    const req = makeRequest('/categories/electronics');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('passes through /profile/:id', () => {
    const req = makeRequest('/profile/user-123');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});

// ── Auth pages — logged-in redirect ──────────────────────────────

describe('middleware — auth pages, logged-in user redirected', () => {
  it('redirects /login → /dashboard when logged in', () => {
    const req = makeRequest('/login', { token: VALID_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/dashboard');
  });

  it('redirects /register → /dashboard when logged in', () => {
    const req = makeRequest('/register', { token: VALID_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/dashboard');
  });

  it('redirects /forgot-password → /dashboard when logged in', () => {
    const req = makeRequest('/forgot-password', { token: VALID_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/dashboard');
  });

  it('allows /login when NOT logged in', () => {
    const req = makeRequest('/login');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('allows /login when token is expired', () => {
    const req = makeRequest('/login', { token: EXPIRED_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});

// ── Protected routes — unauthenticated redirect ───────────────────

describe('middleware — protected routes, unauthenticated redirect', () => {
  const protectedPaths = [
    '/dashboard',
    '/favorites',
    '/my-ads',
    '/settings/profile',
    '/ads/create',
    '/messages',
    '/ads/clr123/edit',
  ];

  for (const path of protectedPaths) {
    it(`redirects ${path} → /login?from=... when no token`, () => {
      const req = makeRequest(path);
      const res = middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('Location') ?? '';
      expect(location).toContain('/login');
      expect(location).toContain('from=');
    });
  }

  it('encodes the original path in ?from param', () => {
    const req = makeRequest('/my-ads');
    const res = middleware(req);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain(encodeURIComponent('/my-ads').replace(/%20/g, '+'));
  });

  it('allows /dashboard with valid token', () => {
    const req = makeRequest('/dashboard', { token: VALID_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('blocks /dashboard with expired token', () => {
    const req = makeRequest('/dashboard', { token: EXPIRED_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/login');
  });

  it('blocks /dashboard with malformed token', () => {
    const req = makeRequest('/dashboard', { token: 'not.a.token' });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('matches /ads/:id/edit via regex', () => {
    const req = makeRequest('/ads/abc123/edit');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/login');
  });

  it('does NOT match /ads/:id (view page) as protected', () => {
    const req = makeRequest('/ads/abc123');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});

// ── Admin routes ──────────────────────────────────────────────────

describe('middleware — admin routes', () => {
  it('blocks /admin with no token → redirects /login', () => {
    const req = makeRequest('/admin');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/login');
  });

  it('blocks /admin/users with USER role → redirects /dashboard', () => {
    const req = makeRequest('/admin/users', { token: VALID_TOKEN, role: 'USER' });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/dashboard');
  });

  it('allows /admin/dashboard with ADMIN role + valid token', () => {
    const req = makeRequest('/admin/dashboard', { token: ADMIN_TOKEN, role: 'ADMIN' });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('allows /admin/ads with ADMIN role', () => {
    const req = makeRequest('/admin/ads', { token: ADMIN_TOKEN, role: 'ADMIN' });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('blocks /admin with valid token but no role cookie → redirects /dashboard', () => {
    const req = makeRequest('/admin', { token: ADMIN_TOKEN });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/dashboard');
  });
});

// ── SEC-05: Role cookie validation ────────────────────────────────

describe('middleware — SEC-05 role cookie validation', () => {
  it('treats unknown role "SUPERADMIN" as non-admin', () => {
    const req = makeRequest('/admin', { token: VALID_TOKEN, role: 'SUPERADMIN' });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/dashboard');
  });

  it('treats empty role "" as non-admin', () => {
    const req = makeRequest('/admin', { token: VALID_TOKEN, role: '' });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('treats injected role "admin" (lowercase) as non-admin (case-sensitive)', () => {
    const req = makeRequest('/admin', { token: VALID_TOKEN, role: 'admin' });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('treats role "ADMIN " (trailing space) as non-admin', () => {
    const req = makeRequest('/admin', { token: VALID_TOKEN, role: 'ADMIN ' });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });
});

// ── Request ID header ─────────────────────────────────────────────

describe('middleware — X-Request-Id header', () => {
  it('sets X-Request-Id on pass-through responses', () => {
    const req = makeRequest('/');
    const res = middleware(req);
    const id = res.headers.get('X-Request-Id');
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it('each request gets a unique Request-Id', () => {
    const a = middleware(makeRequest('/')).headers.get('X-Request-Id');
    const b = middleware(makeRequest('/')).headers.get('X-Request-Id');
    expect(a).not.toBe(b);
  });
});

// ── decodeToken edge cases ────────────────────────────────────────

describe('middleware — token edge cases (decodeToken)', () => {
  it('handles token with no parts (empty string → blocks protected route)', () => {
    const req = makeRequest('/dashboard', { token: '' });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('handles token with only one part (malformed)', () => {
    const req = makeRequest('/dashboard', { token: 'onlyonepart' });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('handles token whose payload is not valid JSON', () => {
    const badPayload = btoa('not json!!!').replace(/=/g, '');
    const req = makeRequest('/dashboard', { token: `header.${badPayload}.sig` });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('10-second clock-skew buffer: token expiring in 5s is treated as expired', () => {
    // exp is 5s in the future, but buffer is 10s → treated as expired
    const token = makeJwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) + 5 });
    const req = makeRequest('/dashboard', { token });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('token expiring in 20s is treated as valid (beyond 10s buffer)', () => {
    const token = makeJwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) + 20 });
    const req = makeRequest('/dashboard', { token });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});
