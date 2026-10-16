import { CACHE } from '../../src/middlewares/cacheControl.middleware';
import { Request, Response, NextFunction } from 'express';

describe('cacheControl middleware', () => {
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('sets short cache headers (publicLive policy: 30s browser, 120s edge + swr 120s)', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.SHORT(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, s-maxage=120, stale-while-revalidate=120'
    );
    expect(next).toHaveBeenCalled();
  });

  it('sets no-store for private endpoints', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.NONE(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('sets long cache headers (reference policy: 300s + swr 600s)', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.LONG(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=600'
    );
  });

  it('sets medium cache headers (publicDetail policy: 30s browser, 180s edge + swr 180s)', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.MEDIUM(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, s-maxage=180, stale-while-revalidate=180'
    );
  });

  it('sets live (short-lived) cache headers with Vary: Authorization', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.LIVE(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, s-maxage=120, stale-while-revalidate=120'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Authorization');
  });
});
