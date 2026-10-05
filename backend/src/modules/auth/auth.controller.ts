import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { getBearerToken } from '../../middlewares/auth.middleware';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { UnauthorizedError } from '../../shared/errors/UnauthorizedError';
import { AppError } from '../../shared/errors/AppError';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setCsrfCookie,
  clearCsrfCookie,
  setSessionHintCookie,
  clearSessionHintCookie,
  getOAuthPurpose,
  clearOAuthPurpose,
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
      // FIX REFRESH-COOKIE-CLEANUP: on any refresh failure (expired,
      // revoked, reused token, or a DB error), clear the three session
      // cookies. Without this, a device whose refresh token had
      // already become invalid kept sending it on every page load —
      // AuthHydrationProvider fires /auth/refresh from the root
      // layout — so every one of those requests hit the blacklist/
      // Redis path and failed with 401, and the browser retained a
      // session-hint cookie that made the edge proxy believe a session
      // existed (redirecting /login → /dashboard → 401 → /login → …).
      // Clearing here puts the client into a clean unauthenticated
      // state and lets the login form render on the first try.
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      clearSessionHintCookie(res);
      next(error);
    }
  },

  logout: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      // FIX BEARER-TOKEN-HELPER-01: getBearerToken returns undefined
      // for a missing/malformed header instead of throwing.
      const accessToken = getBearerToken(req);
      if (!accessToken) throw new UnauthorizedError('No token provided');
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
      // FIX BEARER-TOKEN-HELPER-01: see logout above.
      const accessToken = getBearerToken(req);
      if (!accessToken) throw new UnauthorizedError('No token provided');
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
    const base = `${env.frontendUrl}${env.frontendUrl.endsWith('/') ? '' : '/'}`;
    const loginRedirect = `${base}login`;

    // FIX OAUTH-ERROR-CONTEXT: read purpose before the try block so
    // the failure path can return the user to the page they started
    // from. Previously a failed verify — e.g. the Google account's
    // email does not match any marketplace account, or a transient DB
    // error — redirected to /login even though the user was on
    // /verify-email, so a click on "verify via Google" could drop them
    // on a login page they never asked for. Same for reset. The
    // default sign-in flow keeps using loginRedirect.
    const purpose = getOAuthPurpose(req);
    clearOAuthPurpose(res);

    const errorRedirect = (query: string): string => {
      if (purpose === 'verify') return `${base}verify-email${query}`;
      if (purpose === 'reset') return `${base}forgot-password${query}`;
      if (purpose === 'link') return `${base}settings?tab=security${query}`;
      return `${loginRedirect}${query}`;
    };

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
        res.redirect(errorRedirect('?error=google_auth_failed'));
        return;
      }

      // (purpose and base are read above, before the try, so the
      // failure path can be context-aware — see errorRedirect's own
      // comment. The purpose cookie was cleared there too, so a
      // replayed callback URL cannot re-enter the same branch.)
      if (purpose === 'link') {
        const refreshToken = getRefreshTokenFromCookie(req);
        if (!refreshToken) {
          res.redirect(errorRedirect('?error=session_expired'));
          return;
        }
        await authService.linkGoogleFromRefreshToken(refreshToken, profile);
        res.redirect(`${base}settings?tab=security&google=linked`);
        return;
      }

      if (purpose === 'verify') {
        // Google has already proven the email is verified
        // (extractGoogleProfile only accepts email_verified === true).
        // Mark the account verified and drop the user on /dashboard
        // with ?verified=1 so the banner can show a one-shot
        // confirmation toast; no session is issued.
        const { alreadyVerified } = await authService.verifyEmailViaGoogle(profile.email);
        const suffix = alreadyVerified ? '' : '?verified=1';
        res.redirect(`${base}dashboard${suffix}`);
        return;
      }

      if (purpose === 'reset') {
        // Issue a reset token and hand the user straight to
        // /reset-password; the token in the URL is the only proof
        // required, exactly as if they had clicked a link in a reset
        // email. Null return (no such active account) redirects to a
        // generic error without revealing whether the email exists.
        const token = await authService.issueResetTokenViaGoogle(profile.email);
        if (!token) {
          res.redirect(`${base}forgot-password?error=email_not_found`);
          return;
        }
        res.redirect(`${base}reset-password?token=${token}&via=google`);
        return;
      }

      // Default flow: sign-in (or sign-up), unchanged.
      const result = await authService.loginWithGoogle(profile, getClientIp(req), getUserAgent(req));
      setSessionCookies(res, result.tokens.refreshToken);

      // FEAT-GOOGLE-COMPLETE-PROFILE: a brand-new Google signup (Case 3
      // in loginWithGoogle) comes back with needsProfileCompletion true
      // — send them to the completion step instead of the home page so
      // they confirm their name and pick a city before using the app.
      // Existing/linked accounts (Case 1/2) are always false here and
      // land on the home page exactly as before.
      const postLoginPath = result.user.needsProfileCompletion ? 'complete-profile' : '';
      res.redirect(`${env.frontendUrl}${env.frontendUrl.endsWith('/') ? '' : '/'}${postLoginPath}`);
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
      // FIX OAUTH-ERROR-CODE-PROPAGATION: pass the specific AppError.code
      // through so the login page can show a targeted message. The key
      // case is OAUTH_EMAIL_ALREADY_REGISTERED: without this, a user who
      // tries Google first sees only "google_auth_failed" and has no
      // way to know they should sign in with their existing password
      // instead. Falls back to the generic error flag when the code is
      // unknown, matching prior behavior for non-AppError throws.
      const code = error instanceof AppError ? error.code : undefined;
      const suffix = code ? `&code=${encodeURIComponent(code)}` : '';
      res.redirect(errorRedirect(`?error=google_auth_failed${suffix}`));
    }
  },
  /**
   * FIX FEAT-EMAIL-VERIFY: POST /auth/verify-email — public, no auth
   * required. The token itself IS the proof of ownership; the user
   * might not be logged in (e.g. clicked the link from a phone).
   */
  verifyEmail: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = verifyEmailSchema.parse({ body: req.body });
      await authService.verifyEmail(body.token);
      res.status(200).json(successResponse('Email verified', { emailVerified: true }));
    } catch (error) {
      next(error);
    }
  },

  /**
   * FIX FEAT-EMAIL-VERIFY: POST /auth/resend-verification — requires
   * auth. Rate-limited at the route layer. The service rejects with
   * EMAIL_ALREADY_VERIFIED if the user is already verified.
   */
  resendVerification: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      await authService.resendVerification(user.userId);
      res.status(200).json(successResponse('Verification email sent'));
    } catch (error) {
      next(error);
    }
  },
};
