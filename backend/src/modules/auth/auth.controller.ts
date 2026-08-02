import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { UnauthorizedError } from '../../shared/errors/UnauthorizedError';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setCsrfCookie,
  clearCsrfCookie,
  setSessionHintCookie,
  clearSessionHintCookie,
} from '../../shared/utils/authCookies';

import { getClientIp } from '../../shared/utils/getClientIp';
import { env } from '../../config/env';
import { logger } from '../../shared/utils/logger';

const getUserAgent = (req: Request): string => req.headers['user-agent'] ?? 'unknown';

/**
 * PROD-FIX-15: register/login/refresh previously returned
 * refreshToken as part of the JSON response body, and the frontend
 * stored it in localStorage. Now: refreshToken is set as an httpOnly
 * cookie (never appears in the JSON body at all — see
 * shared/utils/authCookies.ts) and a matching CSRF token is set in a
 * separate, readable cookie the frontend must echo back on
 * state-changing requests (see middlewares/csrf.middleware.ts).
 *
 * `accessToken` still comes back in the JSON body — unchanged, still
 * meant to be kept in memory only by the frontend (never persisted to
 * localStorage), exactly as before this fix.
 *
 * Generic over T so this works for both AuthResult (register/login —
 * has `user`) and the bare `{ tokens }` shape `authService.refresh()`
 * returns (no `user` field) — both share the same `tokens: {
 * accessToken, refreshToken }` shape, which is the only part this
 * function actually needs to inspect/rewrite.
 */
/**
 * FIX OAUTH-01: extracted the cookie-setting from respondWithSession's
 * body so googleCallback (a top-level browser redirect, not a JSON XHR
 * response — see its own comment below) can set the exact same three
 * cookies (refreshToken, csrfToken, app_has_session) without
 * duplicating this logic. Returns the csrf token value since both
 * callers need it — respondWithSession puts it in the JSON body;
 * googleCallback has no body to put it in and doesn't use the return
 * value at all (the cookie itself is sufficient there).
 */
function setSessionCookies(res: Response, refreshToken: string): string {
  setRefreshTokenCookie(res, refreshToken);
  const csrfToken = setCsrfCookie(res);
  // AUDIT-FIX C-1: see authCookies.ts's own doc comment on this
  // function — lets middleware.ts distinguish "no session at all" from
  // "session exists, just needs a silent refresh" on a fresh page load.
  setSessionHintCookie(res);
  return csrfToken;
}

function respondWithSession<T extends { tokens: { accessToken: string; refreshToken: string } }>(
  res: Response,
  status: number,
  message: string,
  result: T
): void {
  const csrfToken = setSessionCookies(res, result.tokens.refreshToken);

  // refreshToken deliberately stripped from the response body — the
  // cookie is now the only place it lives. csrfToken IS included in
  // the body (in addition to its own cookie) purely as a convenience
  // so the frontend doesn't have to parse document.cookie itself on
  // first load; it's not a secret (that's the whole point of the
  // double-submit pattern — see csrf.middleware.ts).
  const { refreshToken: _omit, ...tokensWithoutRefresh } = result.tokens;
  void _omit;

  res.status(status).json(
    successResponse(message, {
      ...result,
      tokens: tokensWithoutRefresh,
      csrfToken,
    })
  );
}

export const authController = {
  register: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = registerSchema.parse({ body: req.body });
      const result = await authService.register(body, getClientIp(req), getUserAgent(req));
      respondWithSession(res, 201, 'Registration successful', result);
    } catch (error) {
      next(error);
    }
  },

  login: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = loginSchema.parse({ body: req.body });
      const result = await authService.login(body, getClientIp(req), getUserAgent(req));
      respondWithSession(res, 200, 'Login successful', result);
    } catch (error) {
      next(error);
    }
  },

  refresh: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // PROD-FIX-15: refreshToken now comes from the httpOnly cookie,
      // never from the request body — there's no longer any client-
      // readable JavaScript value to send back on this endpoint at
      // all, which is the entire point of moving it into an httpOnly
      // cookie in the first place.
      const refreshToken = getRefreshTokenFromCookie(req);
      if (!refreshToken) {
        throw new UnauthorizedError('No refresh token provided');
      }

      const tokens = await authService.refresh(refreshToken);
      respondWithSession(res, 200, 'Token refreshed', { tokens });
    } catch (error) {
      next(error);
    }
  },

  logout: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const accessToken = req.headers.authorization!.split(' ')[1];
      await authService.logout(user.userId, user.sessionId, accessToken, getClientIp(req));
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      clearSessionHintCookie(res); // AUDIT-FIX C-1
      res.status(200).json(successResponse('Logged out successfully'));
    } catch (error) {
      next(error);
    }
  },

  logoutAll: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const accessToken = req.headers.authorization!.split(' ')[1];
      await authService.logoutAll(user.userId, accessToken, getClientIp(req));
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      clearSessionHintCookie(res); // AUDIT-FIX C-1
      res.status(200).json(successResponse('Logged out from all devices'));
    } catch (error) {
      next(error);
    }
  },

  getSessions: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const sessions = await authService.getSessions(user.userId, user.sessionId);
      res.status(200).json(successResponse('Sessions fetched', sessions));
    } catch (error) {
      next(error);
    }
  },

  revokeSession: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { sessionId } = req.params;

      if (!sessionId) throw new BadRequestError('Session ID is required');

      if (sessionId === user.sessionId) {
        throw new BadRequestError('Cannot revoke current session. Use /logout instead');
      }

      await authService.revokeSession(user.userId, sessionId);
      res.status(200).json(successResponse('Session revoked'));
    } catch (error) {
      next(error);
    }
  },


  forgotPassword: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = forgotPasswordSchema.parse({ body: req.body });
      await authService.forgotPassword(body.email);
      // Always return 200 to prevent email enumeration
      res.status(200).json(successResponse(
        'If this email is registered, a password reset link will arrive within minutes',
      ));
    } catch (error) {
      next(error);
    }
  },

  resetPassword: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = resetPasswordSchema.parse({ body: req.body });
      await authService.resetPassword(body.token, body.newPassword);
      res.status(200).json(successResponse('Password reset successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * FIX OAUTH-01 — GET /auth/google/callback.
   *
   * Unlike every other handler in this file, this one is reached after
   * a top-level browser redirect (Google -> this endpoint), not an XHR
   * call from the frontend SPA — there is no frontend JS running on
   * this exact page load to receive a JSON response. So instead of
   * respondWithSession's res.json(...), this sets the identical
   * session cookies (via the same setSessionCookies helper) and issues
   * an HTTP redirect back into the frontend app. The already-global
   * AuthHydrationProvider (mounted in providers/AppProviders.tsx, see
   * its own header comment) then does exactly what it already does on
   * any fresh page load: read the httpOnly refreshToken cookie via
   * /auth/refresh and populate the client-side auth state — no
   * frontend changes were needed for this to work.
   *
   * passport.authenticate('google', { session: false }) (see
   * auth.routes.ts's custom callback) has already run by the time this
   * handler executes and populated req.googleProfile with whatever
   * google.strategy.ts's verify callback passed to done() — the
   * GoogleProfileData shape (NOT a full User row; the actual
   * find-or-create/link happens in authService.loginWithGoogle,
   * called here).
   */
  googleCallback: async (req: Request, res: Response): Promise<void> => {
    const loginRedirect = `${env.frontendUrl}${env.frontendUrl.endsWith('/') ? '' : '/'}login`;

    try {
      const profile = req.googleProfile;
      if (!profile) {
        // passport.authenticate's own failureRedirect (see
        // auth.routes.ts) handles the common "user denied consent on
        // Google's screen" case before this handler is ever reached —
        // reaching here with no profile at all means something more
        // unusual happened (e.g. Google returned no email — see
        // google.strategy.ts's extractGoogleProfile). Same
        // fail-safe/fail-visible treatment as every other unexpected
        // case below.
        logger.warn('Google OAuth callback reached with no profile on req.googleProfile');
        res.redirect(`${loginRedirect}?error=google_auth_failed`);
        return;
      }

      const result = await authService.loginWithGoogle(profile, getClientIp(req), getUserAgent(req));
      setSessionCookies(res, result.tokens.refreshToken);

      res.redirect(env.frontendUrl);
    } catch (error) {
      // Deliberately does NOT call next(error): this request came from
      // a top-level browser navigation with no frontend JS listening
      // for a JSON error body on this exact response — errorMiddleware
      // would just render a bare JSON blob in the user's address bar.
      // A redirect back to /login with an error flag is the correct
      // failure UX for a redirect-based flow, mirroring how e.g.
      // GitHub/Google's own OAuth-consumer examples handle this.
      logger.error('Google OAuth callback failed', {
        error: error instanceof Error ? error.message : error,
      });
      res.redirect(`${loginRedirect}?error=google_auth_failed`);
    }
  },
};