import { Request, Response, NextFunction } from 'express';

/**
 * Minimal Express Request/Response/NextFunction mocks for unit-testing
 * controllers in isolation (service layer mocked separately) — no real
 * HTTP server or supertest round-trip. Chosen for modules that had zero
 * controller-level coverage (only reachable indirectly through
 * integration tests, which need a live Postgres connection this test
 * environment doesn't always have).
 */
export const mockRequest = (overrides?: Partial<Request>): Request => {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;
};

export const mockResponse = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  // FIX OAUTH-01: authController.googleCallback (and the /auth/google
  // routes generally) redirect the browser rather than returning JSON
  // — additive only, every existing test that never calls redirect()
  // is unaffected.
  res.redirect = jest.fn().mockReturnValue(res);
  return res as Response;
};

export const mockNext = (): NextFunction => jest.fn();
