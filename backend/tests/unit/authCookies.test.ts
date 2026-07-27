/**
 * PROD-FIX-15 coverage: authCookies.ts is what actually sets the
 * cookie attributes the entire security model depends on (httpOnly,
 * secure, sameSite, path scoping — see that file's own header comment
 * for the full reasoning behind each). Confirms the res.cookie()/
 * res.clearCookie() calls carry the right options, and that `secure`
 * correctly flips based on NODE_ENV.
 *
 * jest.resetModules() + dynamic re-import per NODE_ENV test, since
 * authCookies.ts reads env.nodeEnv (itself read from process.env once
 * at config/env.ts's module-load time) into a module-level
 * `isProduction` constant — same pattern/reasoning as
 * capacityCheck.test.ts and metrics.test.ts's METRICS_TOKEN tests.
 */
import { Request, Response } from 'express';

const mockRes = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

describe('authCookies', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    // BUGFIX (found during a post-implementation code audit):
    // `process.env.NODE_ENV = undefined` does NOT delete the
    // variable — process.env coerces every value to a string, so this
    // would have set NODE_ENV to the literal string "undefined"
    // rather than actually unsetting it, if ORIGINAL_NODE_ENV had ever
    // been undefined (i.e. running this suite in an environment that
    // never set NODE_ENV to begin with). Harmless in this repo's own
    // CI (NODE_ENV=test is always set explicitly — see
    // .github/workflows/ci.yml), but a genuinely incorrect restore in
    // any environment that didn't set it, and worth being correct
    // regardless of what currently happens to mask it.
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
    jest.resetModules();
  });

  describe('setRefreshTokenCookie', () => {
    it('sets an httpOnly, sameSite=lax cookie scoped to /api/v1/auth with a 7-day maxAge', async () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const { setRefreshTokenCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setRefreshTokenCookie(res as Response, 'a-real-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'a-real-refresh-token', {
        httpOnly: true,
        secure: false, // NODE_ENV !== 'production'
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    });

    it('sets secure:true when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { setRefreshTokenCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setRefreshTokenCookie(res as Response, 'a-real-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'a-real-refresh-token',
        expect.objectContaining({ secure: true }),
      );
    });

    it('sets secure:false when NODE_ENV=development', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { setRefreshTokenCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setRefreshTokenCookie(res as Response, 'a-real-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'a-real-refresh-token',
        expect.objectContaining({ secure: false }),
      );
    });
  });

  describe('clearRefreshTokenCookie', () => {
    it('clears the cookie with the EXACT same attributes used to set it', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { clearRefreshTokenCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      clearRefreshTokenCookie(res as Response);

      // Browsers only clear a cookie whose attributes match exactly —
      // this is the actual bug class this test guards against (a
      // future edit to setRefreshTokenCookie's options without a
      // matching edit here would silently break logout).
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      });
    });
  });

  describe('getRefreshTokenFromCookie', () => {
    it('reads the refreshToken value from req.cookies', async () => {
      const { getRefreshTokenFromCookie } = await import('../../src/shared/utils/authCookies');

      const req = { cookies: { refreshToken: 'the-token-value' } } as unknown as Request;
      expect(getRefreshTokenFromCookie(req)).toBe('the-token-value');
    });

    it('returns undefined when there is no refreshToken cookie', async () => {
      const { getRefreshTokenFromCookie } = await import('../../src/shared/utils/authCookies');

      const req = { cookies: {} } as unknown as Request;
      expect(getRefreshTokenFromCookie(req)).toBeUndefined();
    });

    it('returns undefined when req.cookies itself is undefined (cookie-parser not registered)', async () => {
      const { getRefreshTokenFromCookie } = await import('../../src/shared/utils/authCookies');

      const req = {} as unknown as Request;
      expect(getRefreshTokenFromCookie(req)).toBeUndefined();
    });
  });

  describe('setCsrfCookie', () => {
    it('sets a NON-httpOnly cookie (must be readable by frontend JS)', async () => {
      const { setCsrfCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setCsrfCookie(res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'csrfToken',
        expect.any(String),
        expect.objectContaining({ httpOnly: false, path: '/' }),
      );
    });

    it('returns the same random value it sets as the cookie', async () => {
      const { setCsrfCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      const returnedToken = setCsrfCookie(res as Response);

      const cookieCall = (res.cookie as jest.Mock).mock.calls[0];
      expect(cookieCall[1]).toBe(returnedToken);
    });

    it('generates a different token on every call (not a fixed/predictable value)', async () => {
      const { setCsrfCookie } = await import('../../src/shared/utils/authCookies');

      const res1 = mockRes();
      const res2 = mockRes();
      const token1 = setCsrfCookie(res1 as Response);
      const token2 = setCsrfCookie(res2 as Response);

      expect(token1).not.toBe(token2);
      // 32 bytes hex-encoded = 64 hex characters.
      expect(token1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('clearCsrfCookie', () => {
    it('clears the csrfToken cookie with matching non-httpOnly attributes', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { clearCsrfCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      clearCsrfCookie(res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('csrfToken', {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    });
  });

  describe('getCsrfCookieName', () => {
    it('returns "csrfToken"', async () => {
      const { getCsrfCookieName } = await import('../../src/shared/utils/authCookies');
      expect(getCsrfCookieName()).toBe('csrfToken');
    });
  });

  // AUDIT-FIX C-1 coverage
  describe('setSessionHintCookie', () => {
    it('sets a NON-httpOnly, sameSite=lax cookie scoped to "/" with a 7-day maxAge matching refreshToken', async () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const { setSessionHintCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setSessionHintCookie(res as Response);

      expect(res.cookie).toHaveBeenCalledWith('app_has_session', '1', {
        httpOnly: false,
        secure: false, // NODE_ENV !== 'production'
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    });

    it('sets secure:true when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { setSessionHintCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setSessionHintCookie(res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'app_has_session',
        '1',
        expect.objectContaining({ secure: true }),
      );
    });
  });

  describe('clearSessionHintCookie', () => {
    it('clears the app_has_session cookie with the EXACT same attributes used to set it', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { clearSessionHintCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      clearSessionHintCookie(res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('app_has_session', {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    });
  });

  describe('getSessionHintCookieName', () => {
    it('returns "app_has_session"', async () => {
      const { getSessionHintCookieName } = await import('../../src/shared/utils/authCookies');
      expect(getSessionHintCookieName()).toBe('app_has_session');
    });
  });
});
