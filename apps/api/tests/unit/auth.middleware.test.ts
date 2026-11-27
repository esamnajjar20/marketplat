import { authenticate, optionalAuthenticateWithUserLookup } from '../../src/middlewares/auth.middleware';
import * as jwtUtils from '../../src/shared/auth/jwt';
import { redis } from '../../src/config/redis';
import { userCache } from '../../src/shared/cache/userCache';
import * as tokenStoreModule from '../../src/shared/auth/tokenStore';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { Request, Response, NextFunction } from 'express';

const { tokenStore } = tokenStoreModule;

describe('authenticate middleware', () => {
  const res = {} as Response;
  let next: jest.Mock;

  function mockPipeline(options?: {
    blacklist?: string | null;
    user?: Record<string, unknown> | null;
    sessionExists?: number;
    error?: Error;
  }) {
    const pipeline = {
      get: jest.fn().mockReturnThis(),
      exists: jest.fn().mockReturnThis(),
      exec: options?.error
        ? jest.fn().mockRejectedValue(options.error)
        : jest.fn().mockResolvedValue([
            [null, options?.blacklist ?? null],
            [null, options?.user ? JSON.stringify(options.user) : null],
            [null, options?.sessionExists ?? 1],
          ]),
    };
    jest.spyOn(redis, 'pipeline').mockReturnValue(pipeline as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn() as NextFunction;
    jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({
      userId: 'u1', sessionId: 's1', jti: 'j1',
    } as jwtUtils.JwtPayload);
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({
      id: 'u1', role: 'USER', isActive: true, needsProfileCompletion: false,
    });
    jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);
    jest.spyOn(userCache, 'peek').mockReturnValue(null);
    jest.spyOn(userCache, 'set').mockResolvedValue(undefined);
    jest.spyOn(tokenStore, 'updateSessionLastSeen').mockResolvedValue(undefined);
    jest.spyOn(tokenStoreModule, 'rememberBlacklistL1').mockImplementation(() => undefined);
    mockPipeline();
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects missing bearer token', async () => {
    const req = { headers: {} } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('requires the Redis session record to exist', async () => {
    mockPipeline({ sessionExists: 0 });
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_EXPIRED' }));
  });

  it('rejects a blacklisted token', async () => {
    mockPipeline({ blacklist: '1' });
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects a deactivated user', async () => {
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({
      id: 'u1', role: 'USER', isActive: false, needsProfileCompletion: false,
    });
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('loads a cache miss from the user repository', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    await authenticate(req, res, next);
    expect(userCache.getOrFetch).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalledWith();
  });

  it('attaches the role and profile state on success', async () => {
    mockPipeline({ user: {
      id: 'u1', role: 'ADMIN', isActive: true,
      emailVerified: true, needsProfileCompletion: false,
    } });
    const req = { headers: { authorization: 'Bearer valid-token' }, method: 'GET', path: '/private' } as Request;
    await authenticate(req, res, next);
    expect(req.user?.role).toBe('ADMIN');
    expect(req.user?.needsProfileCompletion).toBe(false);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks an incomplete profile from marketplace routes', async () => {
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({
      id: 'u1', role: 'USER', isActive: true, needsProfileCompletion: true,
    });
    const req = {
      headers: { authorization: 'Bearer valid-token' },
      baseUrl: '/api/v1/ads', path: '/', method: 'POST',
    } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'PROFILE_COMPLETION_REQUIRED' });
  });

  it('allows an incomplete account to update its own profile', async () => {
    jest.spyOn(userCache, 'getOrFetch').mockResolvedValue({
      id: 'u1', role: 'USER', isActive: true, needsProfileCompletion: true,
    });
    const req = {
      headers: { authorization: 'Bearer valid-token' },
      baseUrl: '/api/v1/users', path: '/me', method: 'PATCH',
    } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('refreshes a legacy cached user projection before applying onboarding rules', async () => {
    mockPipeline({ user: { id: 'u1', role: 'USER', isActive: true } });
    const req = { headers: { authorization: 'Bearer valid-token' }, method: 'GET', path: '/private' } as Request;
    await authenticate(req, res, next);
    expect(userCache.invalidate).toHaveBeenCalledWith('u1');
    expect(userCache.getOrFetch).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalledWith();
  });

  it('fails closed when Redis cannot verify the live session even in non-strict mode', async () => {
    mockPipeline({ error: new Error('Redis unavailable') });
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication service unavailable' })
    );
  });

  describe('optionalAuthenticateWithUserLookup', () => {
    it('continues anonymously when no bearer token is provided', async () => {
      const req = { headers: {} } as Request;
      await optionalAuthenticateWithUserLookup(req, res, next);
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('resolves a valid bearer token with an active session', async () => {
      mockPipeline({ user: {
        id: 'u1', role: 'USER', isActive: true,
        emailVerified: true, needsProfileCompletion: false,
      } });
      const req = {
        headers: { authorization: 'Bearer valid-token' },
        method: 'GET', path: '/public', baseUrl: '/api/v1/public',
      } as Request;
      await optionalAuthenticateWithUserLookup(req, res, next);
      expect(req.user?.userId).toBe('u1');
      expect(next).toHaveBeenCalledWith();
    });

    it('degrades invalid credentials to an anonymous public request', async () => {
      const req = { headers: { authorization: 'Bearer bad-token' } } as Request;
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockImplementation(() => { throw new Error('bad token'); });
      await optionalAuthenticateWithUserLookup(req, res, next);
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
