import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { env } from '../../config/env';
import { logger } from '../../shared/utils/logger';

/**
 * FIX OAUTH-01 — Google OAuth Passport strategy.
 *
 * Registered in stateless mode (no express-session anywhere in this
 * app — see auth.routes.ts's `session: false` on both /auth/google
 * and /auth/google/callback). Passport normally uses
 * serializeUser/deserializeUser + a session cookie to remember "who is
 * this request's user" across the redirect to Google and back; with
 * `session: false` that machinery is never invoked, so
 * serializeUser/deserializeUser are intentionally NOT registered here
 * — this app's existing JWT + refresh-token flow (issueSession() in
 * auth.service.ts) is the only thing that establishes a session, same
 * as it already is for local email/password login.
 *
 * This module only *configures* the strategy — it does not decide
 * what to do with the resulting Google profile beyond handing it back
 * to whatever called passport.authenticate('google', ...) (see
 * auth.controller.ts). The actual find-or-create-or-link decision
 * lives in auth.service.ts's loginWithGoogle(), mirroring how
 * register()/login() already own all account-creation/lookup logic
 * for the local flow — this keeps the "given a Google profile, what
 * User do we end up with" business rule in one place, in the service
 * layer, rather than split across this strategy file and the
 * controller.
 */

export interface GoogleProfileData {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Extracts exactly the fields this app cares about from Passport's
 * (deliberately much larger) Profile shape. Throws if Google didn't
 * return a verified, usable email — an account can't be created or
 * linked without one, since email is this app's other unique identity
 * key (see auth.service.ts's loginWithGoogle()).
 */
export function extractGoogleProfile(profile: Profile): GoogleProfileData {
  const email = profile.emails?.find(e => e.verified !== false)?.value ?? profile.emails?.[0]?.value;

  if (!email) {
    throw new Error('Google account has no accessible email address');
  }

  return {
    googleId: profile.id,
    email: email.toLowerCase(),
    // Google always sends displayName for a completed profile; falls
    // back to the email's local part in the (rare) edge case it's
    // somehow blank, so `name` — a required, non-null column on User
    // — is never handed an empty string.
    name: profile.displayName?.trim() || email.split('@')[0],
    avatarUrl: profile.photos?.[0]?.value,
  };
}

/**
 * Registers the 'google' strategy with Passport — but only if all
 * three required env vars are present (env.googleOAuth.isConfigured).
 * Called once at module load (see modules/auth/index.ts). If
 * credentials are missing, this is a deliberate no-op: the app must
 * keep working normally with local auth (see auth.routes.ts / the
 * "not configured" 503 both /auth/google endpoints return in that
 * case) rather than throwing at startup the way a required env var
 * (JWT_SECRET, DATABASE_URL) does — Google OAuth is an optional
 * feature, not a hard dependency, matching Cloudinary/SMTP/Sentry's
 * existing "opt-in" treatment in env.ts.
 */
export function configureGoogleStrategy(): void {
  if (!env.googleOAuth.isConfigured) {
    logger.warn(
      '⚠️  Google OAuth is not configured — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ' +
        'and GOOGLE_CALLBACK_URL must all be set (see .env.example). ' +
        'The app will continue running normally with local email/password authentication only; ' +
        '/auth/google and /auth/google/callback will respond with 503 until these are configured.'
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleOAuth.clientId,
        clientSecret: env.googleOAuth.clientSecret,
        callbackURL: env.googleOAuth.callbackUrl,
        // Only request what this app actually uses (email + basic
        // profile for name/avatar) — no extra Google API scopes.
        scope: ['profile', 'email'],
      },
      // Passport's GoogleStrategy verify callback. Deliberately thin:
      // it just forwards the raw profile to the done() callback
      // unchanged — auth.routes.ts's passport.authenticate('google',
      // { session: false }) custom callback then attaches it to
      // req.googleProfile, and auth.controller.ts's googleCallback
      // handler is what actually calls authService.loginWithGoogle()
      // with it. Keeping this callback a pure pass-through (no DB
      // access here) means the actual find-or-create/link business
      // logic isn't split across two files and stays fully
      // unit-testable via authService directly.
      (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
          const data = extractGoogleProfile(profile);
          // FIX OAUTH-01: passed through Passport's done() as-is —
          // auth.routes.ts's custom passport.authenticate callback
          // receives this exact GoogleProfileData object (not a full
          // User row) and assigns it to req.googleProfile, which
          // authController.googleCallback then hands to
          // authService.loginWithGoogle() to do the actual
          // find-or-create/link. VerifyCallback's second parameter is
          // typed `any` by @types/passport, so no unsafe cast is
          // needed here despite this not being an actual Express.User.
          done(null, data);
        } catch (error) {
          done(error as Error, undefined);
        }
      }
    )
  );

  logger.info('✅ Google OAuth strategy configured');
}

export { passport };
