import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authController } from './auth.controller';
import { sendApiError } from '../../shared/errors/errorResponse';
import { ErrorCode } from '../../shared/errors/errorCodes';
import {
  authRateLimit,
  forgotPasswordRateLimit,
  refreshRateLimit,
  resendVerificationRateLimit,
} from '../../middlewares/rateLimit.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { passport } from './google.strategy';
import type { GoogleProfileData } from './google.strategy';
import { env } from '../../config/env';
import { sessionRedis as redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import {
  generateAndSetOAuthState,
  getOAuthStateFromCookie,
  clearOAuthStateCookie,
  setOAuthPurpose,
  clearOAuthPurpose,
  setMobileOAuthFlowCookie,
  getMobileOAuthFlowId,
  clearMobileOAuthFlowCookie,
} from '../../shared/utils/authCookies';

type GoogleProfileDataOrFalse = GoogleProfileData | false;

export const authRouter = Router();

const mobileOAuthFlowKey = (flowId: string) => `auth:google:mobile-flow:${flowId}`;
const MOBILE_PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;


/**
 * guards both /auth/google endpoints when Google OAuth
 * credentials aren't configured (env.googleOAuth.isConfigured is
 * false — see env.ts / google.strategy.ts's configureGoogleStrategy).
 * Without this, calling passport.authenticate('google', ...) for a
 * strategy that was never registered throws a generic, confusing
 * "Unknown authentication strategy \"google\"" Error deep inside
 * Passport — this returns a clear, on-brand 503 instead, matching how
 * the rest of this app treats optional integrations (Cloudinary
 * uploads, SMTP email — see their own "not configured" checks) rather
 * than crashing or leaking an internal error.
 */
function requireGoogleOAuthConfigured(req: Request, res: Response, next: NextFunction): void {
  if (!env.googleOAuth.isConfigured) {
    sendApiError(
      req,
      res,
      503,
      ErrorCode.GOOGLE_OAUTH_NOT_CONFIGURED,
      'Google OAuth is not configured on this server'
    );
    return;
  }
  next();
}

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration successful
 *       400:
 *         description: Validation error or email already in use
 */
authRouter.post('/register', authRateLimit, authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Account locked or too many attempts
 */
authRouter.post('/login', authRateLimit, authController.login);

/** Native OAuth exchange: one-time ticket + PKCE verifier; no Google token is exposed to the app. */
authRouter.post('/mobile/google/exchange', authRateLimit, authController.mobileGoogleExchange);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: >
 *       refreshToken is now read from an httpOnly cookie
 *       (set by /auth/login, /auth/register, or a prior call to this
 *       same endpoint) rather than the request body. No request body
 *       is required or read; the cookie must be present (the browser
 *       sends it automatically for same-origin requests to
 *       /api/v1/auth/*).
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Session expired, or no refresh token cookie present
 */
authRouter.post('/refresh', refreshRateLimit, authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
authRouter.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Logout from all devices
 *     security:
 *       - BearerAuth: []
 */
authRouter.post('/logout-all', authenticate, authController.logoutAll);

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: Get all active sessions
 *     security:
 *       - BearerAuth: []
 */
authRouter.get('/sessions', authenticate, authController.getSessions);

/**
 * @swagger
 * /auth/sessions/{sessionId}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke a specific session
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 */
authRouter.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

/**
 * POST /auth/forgot-password — request a password reset email.
 * Rate-limited at 10/hr. No authentication required.
 */
authRouter.post('/forgot-password', forgotPasswordRateLimit, authController.forgotPassword);

/**
 * POST /auth/reset-password — set a new password using a reset token.
 * Rate-limited at 10/hr.
 */
authRouter.post('/reset-password', authRateLimit, authController.resetPassword);

// /verify-email is public (the token is the
// proof of ownership; a user clicking the link from their phone may
// not be logged in). /resend-verification requires auth so the
// endpoint knows which user's email to re-send to.
authRouter.post('/verify-email', authRateLimit, authController.verifyEmail);
authRouter.post(
  '/resend-verification',
  authenticate,
  resendVerificationRateLimit,
  authController.resendVerification
);

/**
 * @swagger
 * /auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: Start Google OAuth sign-in
 *     description: >
 *       redirects the browser to Google's consent
 *       screen. Not usable via XHR/fetch — this must be a top-level
 *       browser navigation (e.g. the frontend's "Continue with
 *       Google" button sets window.location.href to this URL, it
 *       does not call it with axios). Returns 503 if Google OAuth
 *       credentials aren't configured on this server (see
 *       requireGoogleOAuthConfigured above).
 *     responses:
 *       302:
 *         description: Redirect to Google's OAuth consent screen
 *       503:
 *         description: Google OAuth is not configured on this server
 */
authRouter.get(
  '/google',
  authRateLimit,
  requireGoogleOAuthConfigured,
  // generate a random `state` value, store it in a
  // short-lived httpOnly cookie scoped to this browser, and pass the
  // same value to Google via passport's `state` option so it comes
  // back unchanged in the callback's query string. See
  // authCookies.ts's generateAndSetOAuthState for the full threat
  // model this closes (OAuth CSRF).
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isMobile = req.query.client === 'mobile';
      const purpose = req.query.purpose;
      if (isMobile) {
        // Native sign-in only. Verify/reset/link are browser-only flows and
        // must not be silently converted into a mobile sign-in.
        if (purpose !== undefined) {
          sendApiError(req, res, 400, ErrorCode.BAD_REQUEST, 'Unsupported native OAuth purpose');
          return;
        }
        const challenge = typeof req.query.code_challenge === 'string' ? req.query.code_challenge : '';
        const challengeMethod = typeof req.query.code_challenge_method === 'string' ? req.query.code_challenge_method : '';
        if (challengeMethod !== 'S256' || !MOBILE_PKCE_CHALLENGE.test(challenge)) {
          sendApiError(req, res, 400, ErrorCode.BAD_REQUEST, 'A valid PKCE code challenge is required');
          return;
        }
        const flowId = crypto.randomBytes(32).toString('hex');
        await redis.set(mobileOAuthFlowKey(flowId), challenge, 'EX', 600);
        setMobileOAuthFlowCookie(res, flowId);
        clearOAuthPurpose(res);
      } else {
        clearMobileOAuthFlowCookie(res);
        if (purpose === 'verify' || purpose === 'reset' || purpose === 'link') {
          setOAuthPurpose(res, purpose);
        } else {
          // A stale purpose cookie from an abandoned browser flow must not
          // affect this new plain sign-in.
          clearOAuthPurpose(res);
        }
      }

      const state = generateAndSetOAuthState(res);
      passport.authenticate('google', {
        session: false,
        scope: ['profile', 'email'],
        state,
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Google OAuth callback
 *     description: >
 *       Google redirects the browser here after the user
 *       approves (or denies) consent. On success, passport.authenticate
 *       populates req.googleProfile with the profile data
 *       google.strategy.ts's verify callback extracted, then
 *       authController.googleCallback takes over: resolves/creates the
 *       User (authService.loginWithGoogle), issues the same JWT +
 *       refresh-token session as local login (issueSession), sets the
 *       same cookies respondWithSession sets for local login/register,
 *       and redirects the browser back into the frontend app — this is
 *       a redirect-based flow throughout, never a JSON response (see
 *       googleCallback's own comment for why).
 *
 *       A Passport-level failure (user clicked "Cancel" on Google's
 *       consent screen, or the code exchange with Google itself
 *       failed) redirects to /auth/google/failure before
 *       googleCallback ever runs; googleCallback's own try/catch is a
 *       second, narrower safety net for failures in
 *       authService.loginWithGoogle() itself (e.g. a locked/deactivated
 *       account, a DB error) — both paths land the user back on
 *       /login with an explanatory query param rather than a raw
 *       error page.
 *     responses:
 *       302:
 *         description: Redirect to the frontend app (success) or /login?error=google_auth_failed (failure)
 *       503:
 *         description: Google OAuth is not configured on this server
 */
authRouter.get(
  '/google/callback',
  requireGoogleOAuthConfigured,
  // verify the `state` Google echoed back in the query
  // string matches the value we stored in the httpOnly cookie when
  // this flow started at GET /auth/google, before ever calling
  // passport.authenticate. A mismatch (or a missing cookie — e.g. the
  // callback is being hit directly/replayed rather than as the second
  // half of a flow this same browser started) is treated exactly like
  // any other OAuth failure: redirect to /google/failure, never
  // proceed to issue a session. The cookie is single-use — cleared
  // here regardless of outcome so a captured/replayed callback URL
  // can't be reused even if somehow re-submitted with a stale but
  // still-matching cookie still present.
  async (req: Request, res: Response, next: NextFunction) => {
    const expectedState = getOAuthStateFromCookie(req);
    const returnedState = typeof req.query.state === 'string' ? req.query.state : undefined;
    clearOAuthStateCookie(res);

    if (!expectedState || !returnedState || expectedState !== returnedState) {
      res.redirect('/api/v1/auth/google/failure');
      return;
    }

    const flowId = getMobileOAuthFlowId(req);
    if (flowId) {
      try {
        const challenge = await redis.get(mobileOAuthFlowKey(flowId));
        if (!challenge || !MOBILE_PKCE_CHALLENGE.test(challenge)) {
          res.redirect('/api/v1/auth/google/failure');
          return;
        }
        res.locals.mobileOAuth = { flowId, challenge };
      } catch (error) {
        next(error);
        return;
      }
    }
    next();
  },
  (req, res, next) => {
    // passing a custom callback as passport.authenticate's
    // third argument means Passport hands control back here instead of
    // auto-populating req.user / auto-redirecting on failure — so
    // `failureRedirect` in the options object would be silently
    // ignored if included; the /google/failure redirect below is
    // handled explicitly instead, in this callback's own (err ||
    // !profile) branch.
    passport.authenticate(
      'google',
      { session: false },
      (err: Error | null, profile: GoogleProfileDataOrFalse) => {
        if (err || !profile) {
          res.redirect('/api/v1/auth/google/failure');
          return;
        }
        req.googleProfile = profile;
        next();
      }
    )(req, res, next);
  },
  authController.googleCallback
);

/**
 * the failureRedirect target above. A plain redirect
 * back to the frontend's login page with an explanatory query param —
 * matches googleCallback's own catch-block failure handling so both
 * "Passport-level failure" (wrong/expired code, user denied consent)
 * and "loginWithGoogle()-level failure" (deactivated account, DB
 * error) land the user in the same place with the same UX.
 */
authRouter.get('/google/failure', async (req, res) => {
  const flowId = getMobileOAuthFlowId(req);
  if (flowId) {
    try {
      await redis.del(mobileOAuthFlowKey(flowId));
    } catch (error) {
      // Failure redirect is still safe; the Redis key expires after 10 minutes.
      // Do not strand the system browser on an API error page.
      logger.warn('Native Google OAuth failure cleanup deferred until Redis TTL', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearMobileOAuthFlowCookie(res);
    }
    res.redirect('marketplat://oauth/callback?error=google_auth_failed');
    return;
  }
  const base = `${env.frontendUrl}${env.frontendUrl.endsWith('/') ? '' : '/'}login`;
  res.redirect(`${base}?error=google_auth_failed`);
});
