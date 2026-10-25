import { cacheControl } from '../../src/middlewares/cacheControl.middleware';
import { Request, Response, NextFunction } from 'express';

describe('cacheControl factory', () => {
  const next = jest.fn() as NextFunction;

  it('omits stale-while-revalidate when not provided', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const middleware = cacheControl(120);

    middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=120');
  });
});
