import { CACHE } from '../../src/middlewares/cacheControl.middleware';
import { Request, Response, NextFunction } from 'express';

describe('cacheControl middleware', () => {
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('sets short cache headers', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.SHORT(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age=30'));
    expect(next).toHaveBeenCalled();
  });

  it('sets no-store for private endpoints', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.NONE(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('sets long cache headers', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.LONG(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age=3600'));
  });

  it('sets medium cache headers', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;

    CACHE.MEDIUM(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age=60'));
  });
});
