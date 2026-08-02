import { Router, Request, Response, NextFunction } from 'express';
import { authController } from './auth.controller';
import { authRateLimit, refreshRateLimit, forgotPasswordRateLimit } from '../../middlewares/rateLimit.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { passport } from './google.strategy';
import type { GoogleProfileData } from './google.strategy';
import { env } from '../../config/env';

type GoogleProfileDataOrFalse = GoogleProfileData | false;

export const authRouter = Router();

/**
 * FIX OAUTH-01: guards both /auth/google endpoints when Google OAuth
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
    res.status(503).json({
      success: false,
      message: 'Google OAuth is not configured on this server',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
      statusCode: 503,
    });
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

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: >
 *       PROD-FIX-15: refreshToken is now read from an httpOnly cookie
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

/**
 * @swagger
 * /auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: Start Google OAuth sign-in
 *     description: >
 *       FIX OAUTH-01: redirects the browser to Google's consent
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
  // FIX OAUTH-01: session:false — this app has no express-session
  // anywhere (see google.strategy.ts's own header comment); Passport
  // must not attempt to read/write a session here. scope matches
  // exactly what google.strategy.ts's GoogleStrategy config declares
  // and what extractGoogleProfile() actually reads (profile + email;
  // no extra Google API scopes requested).
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] })
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Google OAuth callback
 *     description: >
 *       FIX OAUTH-01: Google redirects the browser here after the user
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
  (req, res, next) => {
    // FIX OAUTH-01: passing a custom callback as passport.authenticate's
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
 * FIX OAUTH-01: the failureRedirect target above. A plain redirect
 * back to the frontend's login page with an explanatory query param —
 * matches googleCallback's own catch-block failure handling so both
 * "Passport-level failure" (wrong/expired code, user denied consent)
 * and "loginWithGoogle()-level failure" (deactivated account, DB
 * error) land the user in the same place with the same UX.
 */
authRouter.get('/google/failure', (_req, res) => {
  const base = `${env.frontendUrl}${env.frontendUrl.endsWith('/') ? '' : '/'}login`;
  res.redirect(`${base}?error=google_auth_failed`);
});
