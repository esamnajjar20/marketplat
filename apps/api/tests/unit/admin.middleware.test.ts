import { requireAdmin, requireMinRole, requireAnyAdminTier } from '../../src/middlewares/admin.middleware';
import { ROLES } from '../../src/shared/constants/roles';
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

  // Gap #20: requireAdmin's behavior is unchanged — SUPER_ADMIN, being
  // above ADMIN in rank, must still pass every gate requireAdmin was
  // already used on before this feature existed.
  it('calls next for super admin role (rank above ADMIN)', () => {
    const req = { user: { userId: 'u1', sessionId: 's1', role: 'SUPER_ADMIN' } } as Request;
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('passes ForbiddenError for a moderator (below ADMIN rank)', () => {
    const req = { user: { userId: 'u1', sessionId: 's1', role: 'MODERATOR' } } as Request;
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
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

// Gap #20 (admin permission tiers)
describe('requireMinRole middleware', () => {
  const res = {} as Response;
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  describe('requireMinRole(MODERATOR)', () => {
    const gate = requireMinRole(ROLES.MODERATOR);

    it('allows MODERATOR, ADMIN and SUPER_ADMIN', () => {
      for (const role of ['MODERATOR', 'ADMIN', 'SUPER_ADMIN']) {
        const req = { user: { userId: 'u1', sessionId: 's1', role } } as Request;
        gate(req, res, next);
        expect(next).toHaveBeenLastCalledWith();
      }
    });

    it('rejects USER', () => {
      const req = { user: { userId: 'u1', sessionId: 's1', role: 'USER' } } as Request;
      gate(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('requireMinRole(ADMIN)', () => {
    const gate = requireMinRole(ROLES.ADMIN);

    it('allows ADMIN and SUPER_ADMIN', () => {
      for (const role of ['ADMIN', 'SUPER_ADMIN']) {
        const req = { user: { userId: 'u1', sessionId: 's1', role } } as Request;
        gate(req, res, next);
        expect(next).toHaveBeenLastCalledWith();
      }
    });

    it('rejects MODERATOR', () => {
      const req = { user: { userId: 'u1', sessionId: 's1', role: 'MODERATOR' } } as Request;
      gate(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('rejects a missing/unrecognized role', () => {
      const req = {} as Request;
      gate(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });
});

// Gap #20 (admin permission tiers)
describe('requireAnyAdminTier middleware', () => {
  const res = {} as Response;
  const next = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('allows MODERATOR, ADMIN and SUPER_ADMIN', () => {
    for (const role of ['MODERATOR', 'ADMIN', 'SUPER_ADMIN']) {
      const req = { user: { userId: 'u1', sessionId: 's1', role } } as Request;
      requireAnyAdminTier(req, res, next);
      expect(next).toHaveBeenLastCalledWith();
    }
  });

  it('rejects USER', () => {
    const req = { user: { userId: 'u1', sessionId: 's1', role: 'USER' } } as Request;
    requireAnyAdminTier(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('rejects when user is missing', () => {
    const req = {} as Request;
    requireAnyAdminTier(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
