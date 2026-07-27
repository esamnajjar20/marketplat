import { requireAdmin } from '../../src/middlewares/admin.middleware';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { Request, Response, NextFunction } from 'express';

describe('requireAdmin middleware', () => {
  const res = {} as Response;
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('calls next for admin role', () => {
    const req = { user: { userId: 'u1', sessionId: 's1', role: 'ADMIN' } } as Request;
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('passes ForbiddenError for regular user', () => {
    const req = { user: { userId: 'u1', sessionId: 's1', role: 'USER' } } as Request;
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('passes ForbiddenError when user is missing', () => {
    const req = {} as Request;
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
