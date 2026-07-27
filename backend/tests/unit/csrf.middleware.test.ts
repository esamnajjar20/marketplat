import { csrfProtection } from '../../src/middlewares/csrf.middleware';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { Request, Response, NextFunction } from 'express';

/**
 * PROD-FIX-15 coverage: csrfProtection is new, security-critical logic
 * (double-submit cookie CSRF check — see the middleware's own header
 * comment for the full threat model). This confirms:
 *   - safe methods (GET/HEAD/OPTIONS) always pass, regardless of cookie/header state
 *   - /auth/login and /auth/register are exempt (they ISSUE the cookie)
 *   - a request with NO csrfToken cookie at all passes through unchecked
 *     (the critical scoping decision that keeps pure Bearer-token
 *     clients, including this repo's own other integration tests,
 *     working without ever sending a CSRF header)
 *   - a request WITH a csrfToken cookie is rejected unless the
 *     X-CSRF-Token header exactly matches it
 */
const mockReq = (overrides: Partial<Request> = {}): Partial<Request> => ({
  method: 'POST',
  path: '/ads',
  cookies: {},
  headers: {},
  ...overrides,
});

const mockRes = (): Partial<Response> => ({});
const mockNext = (): NextFunction => jest.fn();

describe('csrfProtection', () => {
  it('allows GET requests through regardless of cookie/header state', () => {
    const req = mockReq({ method: 'GET', cookies: { csrfToken: 'abc' }, headers: {} });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith(); // called with no error
  });

  it('allows HEAD requests through regardless of cookie/header state', () => {
    const req = mockReq({ method: 'HEAD', cookies: { csrfToken: 'abc' }, headers: {} });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows OPTIONS requests through regardless of cookie/header state', () => {
    const req = mockReq({ method: 'OPTIONS', cookies: { csrfToken: 'abc' }, headers: {} });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('exempts POST /auth/login even with a mismatched csrfToken cookie/header', () => {
    const req = mockReq({
      method: 'POST',
      path: '/auth/login',
      cookies: { csrfToken: 'real-token' },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('exempts POST /auth/register even with a mismatched csrfToken cookie/header', () => {
    const req = mockReq({
      method: 'POST',
      path: '/auth/register',
      cookies: { csrfToken: 'real-token' },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('does NOT exempt POST /auth/refresh — it is a state-changing, cookie-authenticated endpoint', () => {
    const req = mockReq({
      method: 'POST',
      path: '/auth/refresh',
      cookies: { csrfToken: 'real-token' },
      headers: {}, // no X-CSRF-Token header at all
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('CRITICAL SCOPING: passes through untouched when no csrfToken cookie is present at all (pure Bearer-token client)', () => {
    // This is what keeps every existing integration test (and any
    // real non-browser API client) working — see the middleware's own
    // header comment for the full reasoning.
    const req = mockReq({
      method: 'POST',
      path: '/ads',
      cookies: {}, // no csrfToken cookie
      headers: {}, // no X-CSRF-Token header either
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when a csrfToken cookie is present but no X-CSRF-Token header is sent', () => {
    const req = mockReq({
      method: 'POST',
      path: '/ads',
      cookies: { csrfToken: 'real-token' },
      headers: {},
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('rejects when the X-CSRF-Token header does not match the csrfToken cookie', () => {
    const req = mockReq({
      method: 'POST',
      path: '/ads',
      cookies: { csrfToken: 'real-token' },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('allows the request through when the X-CSRF-Token header matches the csrfToken cookie exactly', () => {
    const req = mockReq({
      method: 'POST',
      path: '/ads',
      cookies: { csrfToken: 'matching-token-123' },
      headers: { 'x-csrf-token': 'matching-token-123' },
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an empty-string csrfToken cookie even if the header is also an empty string', () => {
    const req = mockReq({
      method: 'POST',
      path: '/ads',
      cookies: { csrfToken: '' },
      headers: { 'x-csrf-token': '' },
    });
    const next = mockNext();
    csrfProtection(req as Request, mockRes() as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('applies the same check to PUT, PATCH, and DELETE, not just POST', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const req = mockReq({
        method,
        path: '/ads/some-id',
        cookies: { csrfToken: 'real-token' },
        headers: {},
      });
      const next = mockNext();
      csrfProtection(req as Request, mockRes() as Response, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    }
  });
});
