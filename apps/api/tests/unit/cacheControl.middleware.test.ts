import { CACHE, privateApiCacheDefault } from '../../src/middlewares/cacheControl.middleware';
import { Request, Response, NextFunction } from 'express';

describe('cacheControl middleware', () => {
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('sets short cache headers (publicLive policy: 30s browser, 120s edge + swr 120s)', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;

    CACHE.SHORT(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, s-maxage=120, stale-while-revalidate=120'
    );
    expect(next).toHaveBeenCalled();
  });

  it('sets no-store for private endpoints', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;

    CACHE.NONE(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.vary).toHaveBeenNthCalledWith(1, 'Authorization');
    expect(res.vary).toHaveBeenNthCalledWith(2, 'Cookie');
  });

  it('sets long cache headers (reference policy: 300s + swr 600s)', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;

    CACHE.LONG(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=300, s-maxage=900, stale-while-revalidate=600'
    );
  });

  it('sets medium cache headers (publicDetail policy: 30s browser, 180s edge + swr 180s)', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;

    CACHE.MEDIUM(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, s-maxage=180, stale-while-revalidate=180'
    );
  });

  it('sets live (short-lived) cache headers with auth and cookie variance', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;

    CACHE.LIVE(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, s-maxage=120, stale-while-revalidate=120'
    );
    expect(res.vary).toHaveBeenNthCalledWith(1, 'Authorization');
    expect(res.vary).toHaveBeenNthCalledWith(2, 'Cookie');
  });


  it('defaults unclassified API responses to private no-store', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;
    privateApiCacheDefault(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.vary).toHaveBeenNthCalledWith(1, 'Authorization');
    expect(res.vary).toHaveBeenNthCalledWith(2, 'Cookie');
  });

  it('does not allow a public cache preset to cache a request with Authorization', () => {
    const req = { headers: { authorization: 'Bearer user-token' } } as unknown as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;
    CACHE.SHORT(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.vary).toHaveBeenNthCalledWith(1, 'Authorization');
    expect(res.vary).toHaveBeenNthCalledWith(2, 'Cookie');
  });

  it('does not allow a public cache preset to cache a request carrying the app access-token cookie', () => {
    const req = { headers: { cookie: 'app_access_token=signed-jwt' } } as unknown as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;
    CACHE.SHORT(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.vary).toHaveBeenNthCalledWith(1, 'Authorization');
    expect(res.vary).toHaveBeenNthCalledWith(2, 'Cookie');
  });


  it.each([
    ['refreshToken', 'opaque-refresh-token'],
    ['app_has_session', '1'],
  ])('does not apply a public cache preset when the %s cookie is present', (cookieName, value) => {
    const req = { headers: { cookie: `${cookieName}=${value}` } } as unknown as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;

    CACHE.SHORT(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('sets private validator-only policy for explicitly opted-in profile responses', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn(), vary: jest.fn() } as unknown as Response;
    CACHE.PRIVATE_REVALIDATE(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-cache, no-transform'
    );
    expect(res.vary).toHaveBeenNthCalledWith(1, 'Authorization');
    expect(res.vary).toHaveBeenNthCalledWith(2, 'Cookie');
  });
});
