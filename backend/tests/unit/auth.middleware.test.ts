import { authenticate } from '../../src/middlewares/auth.middleware';
import * as jwtUtils from '../../src/shared/utils/jwt';
import { redis } from '../../src/config/redis';
import { userCache } from '../../src/shared/utils/userCache';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { env } from '../../src/config/env';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { Request, Response, NextFunction } from 'express';

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

  describe('authenticate middleware', () => {
  const res = {} as Response;
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({
      userId: 'u1',
      sessionId: 's1',
    } as jwtUtils.JwtPayload);
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({ id: 'u1', role: 'USER', isActive: true });
    jest.spyOn(tokenStore, 'updateSessionLastSeen').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects missing bearer token', async () => {
    const req = { headers: {} } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects blacklisted token', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    jest.spyOn(redis, 'pipeline').mockReturnValue({
      get: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, '1'],
        [null, null],
      ]),
    } as any);

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects deactivated user', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    jest.spyOn(redis, 'pipeline').mockReturnValue({
      get: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, null],
        [null, null],
      ]),
    } as any);
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({ id: 'u1', role: 'USER', isActive: false });

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('loads user from cache miss via getOrFetch', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    jest.spyOn(redis, 'pipeline').mockReturnValue({
      get: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, null],
        [null, null],
      ]),
    } as any);

    await authenticate(req, res, next);
    expect(userCache.getOrFetch).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalledWith();
  });

  it('attaches user and calls next on success', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    jest.spyOn(redis, 'pipeline').mockReturnValue({
      get: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, null],
        [null, JSON.stringify({ id: 'u1', role: 'ADMIN', isActive: true })],
      ]),
    } as any);

    await authenticate(req, res, next);
    expect(req.user?.role).toBe('ADMIN');
    expect(next).toHaveBeenCalledWith();
  });

  it('wraps invalid JWT as UnauthorizedError', async () => {
    const req = { headers: { authorization: 'Bearer bad-token' } } as Request;
    jest.spyOn(jwtUtils, 'verifyAccessToken').mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid or expired token' }));
  });

  it('rejects when redis pipeline fails in strict mode', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    const originalStrict = env.security.blacklistStrict;
    (env.security as { blacklistStrict: boolean }).blacklistStrict = true;

    jest.spyOn(redis, 'pipeline').mockImplementation(() => {
      throw new Error('Redis unavailable');
    });

    await authenticate(req, res, next);

    (env.security as { blacklistStrict: boolean }).blacklistStrict = originalStrict;
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication service unavailable' })
    );
  });

  it('continues when redis fails in non-strict mode', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    const originalStrict = env.security.blacklistStrict;
    (env.security as { blacklistStrict: boolean }).blacklistStrict = false;

    jest.spyOn(redis, 'pipeline').mockImplementation(() => {
      throw new Error('Redis unavailable');
    });
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({ id: 'u1', role: 'USER', isActive: true });

    await authenticate(req, res, next);

    (env.security as { blacklistStrict: boolean }).blacklistStrict = originalStrict;
    expect(next).toHaveBeenCalledWith();
  });
});
