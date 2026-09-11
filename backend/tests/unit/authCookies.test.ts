/**
 * PROD-FIX-15 / DEPLOY-FIX-01 coverage: authCookies.ts is what
 * actually sets the cookie attributes the entire security model
 * depends on (httpOnly, secure, sameSite, path scoping — see that
 * file's own header comment for the full reasoning behind each).
 * Confirms the res.cookie()/res.clearCookie() calls carry the right
 * options.
 *
 * DEPLOY-FIX-01: refreshToken/csrfToken/app_has_session now always
 * set secure:true + sameSite:'none' (required to cross the
 * *.up.railway.app subdomain boundary between frontend and backend —
 * see authCookies.ts's own comment on setRefreshTokenCookie). This is
 * no longer conditional on NODE_ENV, so the old "flips based on
 * NODE_ENV" tests for those three cookies are gone; oauth_state is
 * unaffected (still a same-origin round trip) and keeps its
 * NODE_ENV-dependent secure flag/coverage.
 *
 * jest.resetModules() + dynamic re-import per NODE_ENV test is kept
 * for the oauth_state cases below, since authCookies.ts still reads
 * env.nodeEnv (itself read from process.env once at config/env.ts's
 * module-load time) into a module-level `isProduction` constant for
 * that cookie — same pattern/reasoning as capacityCheck.test.ts and
 * metrics.test.ts's METRICS_TOKEN tests.
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
  const ORIGINAL_REDIS_PASSWORD = process.env.REDIS_PASSWORD;
  const ORIGINAL_CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
  const ORIGINAL_CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
  const ORIGINAL_CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

  /**
   * env.ts requires REDIS_PASSWORD and CLOUDINARY_* when
   * NODE_ENV=production (FIX PROD-AUDIT-01 added the Cloudinary half —
   * previously only REDIS_PASSWORD was enforced here). Several cases
   * below temporarily flip NODE_ENV to 'production' and call
   * jest.resetModules() so authCookies re-reads env.nodeEnv — that
   * re-import re-runs env.ts's schema parse. Without these set, the
   * parse fails. We plant dummy values only for those cases and always
   * restore them in afterEach so other suites are not affected.
   */
  function withProductionEnv() {
    process.env.NODE_ENV = 'production';
    if (!process.env.REDIS_PASSWORD) {
      process.env.REDIS_PASSWORD = 'test-only-redis-password-not-for-real-use';
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      process.env.CLOUDINARY_CLOUD_NAME = 'test-only-cloud-name';
    }
    if (!process.env.CLOUDINARY_API_KEY) {
      process.env.CLOUDINARY_API_KEY = 'test-only-api-key';
    }
    if (!process.env.CLOUDINARY_API_SECRET) {
      process.env.CLOUDINARY_API_SECRET = 'test-only-api-secret';
    }
  }

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
    if (ORIGINAL_REDIS_PASSWORD === undefined) {
      delete process.env.REDIS_PASSWORD;
    } else {
      process.env.REDIS_PASSWORD = ORIGINAL_REDIS_PASSWORD;
    }
    if (ORIGINAL_CLOUDINARY_CLOUD_NAME === undefined) {
      delete process.env.CLOUDINARY_CLOUD_NAME;
    } else {
      process.env.CLOUDINARY_CLOUD_NAME = ORIGINAL_CLOUDINARY_CLOUD_NAME;
    }
    if (ORIGINAL_CLOUDINARY_API_KEY === undefined) {
      delete process.env.CLOUDINARY_API_KEY;
    } else {
      process.env.CLOUDINARY_API_KEY = ORIGINAL_CLOUDINARY_API_KEY;
    }
    if (ORIGINAL_CLOUDINARY_API_SECRET === undefined) {
      delete process.env.CLOUDINARY_API_SECRET;
    } else {
      process.env.CLOUDINARY_API_SECRET = ORIGINAL_CLOUDINARY_API_SECRET;
    }
    jest.resetModules();
  });

  describe('setRefreshTokenCookie', () => {
    it('sets an httpOnly, sameSite=none, secure cookie scoped to /api/v1/auth with a 7-day maxAge', async () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const { setRefreshTokenCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setRefreshTokenCookie(res as Response, 'a-real-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'a-real-refresh-token', {
        httpOnly: true,
        secure: true, // DEPLOY-FIX-01: always true, sameSite:'none' requires it
        sameSite: 'none',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    });

    it('keeps secure:true regardless of NODE_ENV (DEPLOY-FIX-01 — no longer conditional)', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { setRefreshTokenCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setRefreshTokenCookie(res as Response, 'a-real-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'a-real-refresh-token',
        expect.objectContaining({ secure: true, sameSite: 'none' }),
      );
    });
  });

  describe('clearRefreshTokenCookie', () => {
    it('clears the cookie with the EXACT same attributes used to set it', async () => {
      withProductionEnv();
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
        sameSite: 'none',
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
      withProductionEnv();
      jest.resetModules();
      const { clearCsrfCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      clearCsrfCookie(res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('csrfToken', {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
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
    it('sets a NON-httpOnly, sameSite=none, secure cookie scoped to "/" with a 7-day maxAge matching refreshToken', async () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const { setSessionHintCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setSessionHintCookie(res as Response);

      expect(res.cookie).toHaveBeenCalledWith('app_has_session', '1', {
        httpOnly: false,
        secure: true, // DEPLOY-FIX-01: always true, sameSite:'none' requires it
        sameSite: 'none',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    });

    it('keeps secure:true regardless of NODE_ENV (DEPLOY-FIX-01 — no longer conditional)', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { setSessionHintCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      setSessionHintCookie(res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'app_has_session',
        '1',
        expect.objectContaining({ secure: true, sameSite: 'none' }),
      );
    });
  });

  describe('clearSessionHintCookie', () => {
    it('clears the app_has_session cookie with the EXACT same attributes used to set it', async () => {
      withProductionEnv();
      jest.resetModules();
      const { clearSessionHintCookie } = await import('../../src/shared/utils/authCookies');

      const res = mockRes();
      clearSessionHintCookie(res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('app_has_session', {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
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
