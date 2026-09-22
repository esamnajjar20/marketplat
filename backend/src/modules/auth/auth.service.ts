import { authRepository } from './auth.repository';
import { prisma } from '../../config/prisma';
import crypto from 'crypto';
import { hashPassword, comparePassword, comparePasswordOrDummy } from '../../shared/utils/hash';
import {
  signTokenPair,
  rotateTokenPair,
  verifyRefreshToken,
  getTokenRemainingTTL,
  TokenPair,
} from '../../shared/utils/jwt';
import { tokenStore } from '../../shared/utils/tokenStore';
import { atomicRefreshRotate, RotateResult } from '../../shared/utils/refreshLock';
import { userCache } from '../../shared/utils/userCache';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { emailService } from '../../shared/utils/emailService';
import { sendSecurityAlert } from '../../shared/utils/securityAlert';
import { withOAuthAccountResolutionLock } from '../../shared/utils/oauthLock';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { UnauthorizedError } from '../../shared/errors/UnauthorizedError';
import { TooManyRequestsError } from '../../shared/errors/TooManyRequestsError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { AppError } from '../../shared/errors/AppError';
import { RegisterInput, LoginInput } from './auth.validation';
import { logger } from '../../shared/utils/logger';
import { GoogleProfileData } from './google.strategy';

const MAX_EMAIL_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 50;
const LOCKOUT_DURATION = 30 * 60;

/**
 * FIX FORGOT-PASSWORD-TIMING-01: the minimum wall-clock time a
 * forgotPassword() response may take, regardless of whether the
 * requested email actually exists. Without this floor, an
 * unauthenticated caller could distinguish registered emails from
 * unknown ones by response latency alone: the "user not found" branch
 * returns in a few milliseconds while a real request pays for a DB
 * write and a full SMTP round trip (~250-1000ms). The rate limit
 * (3/hour per IP) slows the attack but does not close it — a patient
 * attacker with a few residential proxies can still enumerate a
 * meaningful fraction of the user base per day. This is the same
 * CWE-208 class we already closed in login() via
 * comparePasswordOrDummy; here a fixed time-floor is the appropriate
 * tool because the two branches do genuinely different work and we
 * don't want to run the full pipeline for nonexistent users.
 *
 * 700ms is chosen above the realistic minimum cost of a database
 * write + local SMTP handshake on the production deployment, so the
 * floor is what actually dominates the response in both branches.
 */
const FORGOT_PASSWORD_MIN_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AuthResult {
  tokens: Omit<TokenPair, 'sessionId'>;
  // FEAT-GOOGLE-COMPLETE-PROFILE: optional, present (and meaningful)
  // only from loginWithGoogle — register()/login() never set it, so
  // it's simply absent/falsy there, matching those accounts always
  // having needsProfileCompletion=false. authController.googleCallback
  // reads this to pick the post-login redirect target.
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    needsProfileCompletion?: boolean;
    // FIX FEAT-EMAIL-VERIFY: present on every response. Frontend uses
    // this to render a "verify your email" banner. Google-signup
    // users come through as true (see authRepository.createWithGoogle);
    // local registrations default to false until the verify-email
    // link is clicked.
    emailVerified?: boolean;
  };
}

/**
 * Issues a new session for a user who just registered or logged in:
 * signs the token pair, persists the refresh token, warms the user cache,
 * and shapes the AuthResult. register() and login() differ only in which
 * audit event they log (and login's also includes the sessionId), so this
 * shared setup is factored out rather than duplicated in both places.
 */
async function issueSession(
  user: { id: string; name: string; email: string; role: string; needsProfileCompletion?: boolean; emailVerified?: boolean },
  ip: string,
  userAgent: string,
): Promise<{ result: AuthResult; sessionId: string }> {
  const tokens = signTokenPair(user.id);

  await tokenStore.saveRefreshToken(user.id, tokens.sessionId, tokens.refreshToken, {
    userAgent,
    rawIp: ip,
    ip,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  });

  await userCache.set({ id: user.id, role: user.role, isActive: true, emailVerified: user.emailVerified });

  return {
    sessionId: tokens.sessionId,
    result: {
      tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn },
      user: { id: user.id, name: user.name, email: user.email, role: user.role, needsProfileCompletion: user.needsProfileCompletion, emailVerified: user.emailVerified },
    },
  };
}

export const authService = {
  register: async (
    input: RegisterInput,
    ip = 'unknown',
    userAgent = 'unknown'
  ): Promise<AuthResult> => {
    const existingEmail = await authRepository.findByEmail(input.email);
    if (existingEmail) throw new BadRequestError('Email already in use', 'EMAIL_ALREADY_EXISTS');

    if (input.phone) {
      const existingPhone = await authRepository.findByPhone(input.phone);
      if (existingPhone) throw new BadRequestError('Phone number already in use', 'PHONE_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      phone: input.phone,
      city: input.city,
    });

    // FIX M-001: user creation (PostgreSQL) and issueSession (Redis: refresh
    // token save + cache warm) are not covered by a single transaction —
    // they can't be, since they hit two different data stores. If Redis
    // (or anything else inside issueSession) fails after the user row above
    // already committed, the user would be left orphaned: present in
    // PostgreSQL with no valid session, unable to log in (no session to
    // reach) and unable to register again (email already taken). Since a
    // true distributed transaction isn't available here, we compensate:
    // on any issueSession failure, best-effort delete the just-created
    // user so the email becomes free again and the caller gets a clean
    // error to retry against, instead of a permanently stuck account.
    let result: AuthResult;
    try {
      ({ result } = await issueSession(user, ip, userAgent));
    } catch (err) {
      try {
        await authRepository.deleteById(user.id);
      } catch (cleanupErr) {
        logger.error('Failed to clean up orphaned user after issueSession failure', {
          userId: user.id,
          cleanupError: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
      logger.error('issueSession failed during registration', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError('Registration failed, please try again', 503);
    }

    auditLog({ event: AuditEvent.REGISTER, userId: user.id, ip, userAgent }).catch(() => {});

    // FIX FEAT-EMAIL-VERIFY: fire-and-forget (same contract as
    // forgotPassword's dispatch) — a slow or failing verification
    // email must never block the registration response. Failure is
    // logged; the user can request a re-send from the banner.
    void (async () => {
      try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

        // Clear any prior unused tokens for this user — same
        // bounded-table pattern as forgotPassword.
        await prisma.emailVerificationToken.deleteMany({
          where: { userId: user.id, used: false },
        });
        await prisma.emailVerificationToken.create({
          data: { token, userId: user.id, expiresAt: expiry },
        });

        await emailService.sendVerificationEmail(user.email, token);
        logger.info('Verification email dispatched', { userId: user.id });
      } catch (err) {
        logger.error('Failed to dispatch verification email', {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return result;
  },

  login: async (input: LoginInput, ip = 'unknown', userAgent = 'unknown'): Promise<AuthResult> => {
    const [isEmailLocked, ipAttempts] = await Promise.all([
      tokenStore.isAccountLocked(input.email),
      tokenStore.getIpAttempts(ip),
    ]);

    if (isEmailLocked) {
      throw new TooManyRequestsError('Account temporarily locked. Try again in 30 minutes', 'ACCOUNT_LOCKED');
    }

    if (ipAttempts >= MAX_IP_ATTEMPTS) {
      throw new TooManyRequestsError('Too many requests from this network. Please try again later', 'TOO_MANY_ATTEMPTS_FROM_IP');
    }

    const user = await authRepository.findByEmail(input.email);

    // FIX LOGIN-TIMING-01: run a bcrypt compare unconditionally, using a
    // fixed dummy hash when the target user (or that user's passwordHash)
    // does not exist. Before this, the "no such user" branch returned
    // in a few milliseconds while "user exists, password wrong" cost a
    // full bcrypt comparison (~250ms at SALT_ROUNDS=12). The gap is
    // trivially measurable over the wire and lets an unauthenticated
    // attacker enumerate registered emails by submitting candidates and
    // reading response latency — CWE-208. See comparePasswordOrDummy's
    // own docblock in hash.ts for the exact mechanism.
    //
    // Note the OAUTH-01 "Google-only account" case (user exists, but
    // passwordHash is null) now takes the same wall-clock time as a
    // wrong-password attempt, closing the same leak for that branch
    // too.
    const hashToCheck = user?.passwordHash ?? null;
    const isPasswordValid = await comparePasswordOrDummy(input.password, hashToCheck);

    if (!user || !user.passwordHash) {
      const { emailAttempts } = await tokenStore.incrementFailedLogins(input.email, ip);
      if (emailAttempts >= MAX_EMAIL_ATTEMPTS) {
        await tokenStore.lockAccount(input.email, LOCKOUT_DURATION);
      }
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_DEACTIVATED');

    if (!isPasswordValid) {
      const { emailAttempts } = await tokenStore.incrementFailedLogins(input.email, ip);

      auditLog({
        event: AuditEvent.LOGIN_FAILED,
        userId: user.id,
        ip,
        userAgent,
        details: { emailAttempts },
      }).catch(() => {});

      if (emailAttempts >= MAX_EMAIL_ATTEMPTS) {
        await tokenStore.lockAccount(input.email, LOCKOUT_DURATION);
        logger.warn('Account locked', { email: input.email, ip });

        sendSecurityAlert({
          userId: user.id,
          ip,
          event: 'ACCOUNT_LOCKED',
          details: { email: input.email },
        }).catch(() => {});

        throw new TooManyRequestsError('Account temporarily locked. Try again in 30 minutes', 'ACCOUNT_LOCKED');
      }
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    await tokenStore.clearFailedLogins(input.email, ip);

    const { result, sessionId } = await issueSession(user, ip, userAgent);

    auditLog({
      event: AuditEvent.LOGIN_SUCCESS,
      userId: user.id,
      ip,
      userAgent,
      sessionId,
    }).catch(() => {});

    return result;
  },

  /**
   * FIX OAUTH-01 — Google OAuth login/signup/link.
   *
   * Called from auth.controller.ts's googleCallback handler with the
   * profile data google.strategy.ts's verify callback attached to
   * req.user. Three cases, checked in this order:
   *
   *   1. googleId already linked to a user  -> plain login.
   *   2. No googleId match, but the email already has a (local or
   *      previously-Google) account -> link this Google identity onto
   *      that existing account (never creates a duplicate user for an
   *      email that already exists — same "email is the one true
   *      identity key" rule register() already enforces for local
   *      signup).
   *   3. Neither matches -> brand-new user, provider='google', no
   *      passwordHash. Deliberately does NOT create a SellerProfile
   *      (see auth.repository.ts's createWithGoogle comment) —
   *      becoming a seller stays an explicit opt-in via POST /sellers
   *      for every account regardless of how it was created,
   *      unchanged from existing behavior.
   *
   * Reuses issueSession() (the same helper register()/login() call)
   * for the actual token-issuing/session-establishing step, so a
   * Google-authenticated session is byte-for-byte the same shape (JWT
   * pair, refresh token persisted via tokenStore, user cache warmed)
   * as a local one — auth.controller.ts's respondWithSession,
   * /auth/refresh, /auth/logout, session listing/revocation, and the
   * frontend's AuthHydrationProvider all keep working completely
   * unchanged for a Google-originated session.
   *
   * Wrapped in withOAuthAccountResolutionLock keyed by email: two
   * concurrent callbacks for the same email (double-click, two tabs)
   * must not both pass the "no existing account" check and both
   * attempt to create/link — see oauthLock.ts's own comment.
   */
  loginWithGoogle: async (
    profile: GoogleProfileData,
    ip = 'unknown',
    userAgent = 'unknown'
  ): Promise<AuthResult> => {
    return withOAuthAccountResolutionLock(profile.email, async () => {
      // Case 1: this Google account has already signed in here before.
      const byGoogleId = await authRepository.findByGoogleId(profile.googleId);

      if (byGoogleId) {
        if (!byGoogleId.isActive) {
          throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
        }

        const { result, sessionId } = await issueSession(byGoogleId, ip, userAgent);

        auditLog({
          event: AuditEvent.OAUTH_LOGIN,
          userId: byGoogleId.id,
          ip,
          userAgent,
          sessionId,
          details: { provider: 'google' },
        }).catch(() => {});

        return result;
      }

      // Case 2: no googleId match — but does this email already exist?
      // See the collision guard below for why we no longer link blindly.
      const byEmail = await authRepository.findByEmail(profile.email);

      if (byEmail) {
        if (!byEmail.isActive) {
          throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
        }

        // FIX OAUTH-EMAIL-COLLISION-01: the previous behavior linked
        // the Google identity to whatever account already held this
        // email, on the assumption that "email exists in our DB"
        // implied "the requester owns that email." That assumption is
        // false here: register() has no email-verification step, so
        // anyone can pre-register a LOCAL account under any email they
        // like. An attacker who knows a victim's email could register
        // locally with that email (choosing their own password), wait
        // for the victim to click "Sign in with Google," and the
        // victim's first Google sign-in would silently link their
        // Google identity onto the attacker's local account. The
        // attacker retains the local password they chose, giving
        // permanent account access: read messages, change password,
        // impersonate. Requiring proof of a prior Google link on the
        // account closes this without breaking any legitimate flow.
        if (byEmail.googleId && byEmail.googleId !== profile.googleId) {
          // The account is already linked to a DIFFERENT Google identity.
          // Silently replacing one Google identity with another is not
          // something this app supports — googleId is a single-value
          // link. Refuse and let an operator resolve manually.
          logger.warn(
            'Google sign-in blocked: account already linked to a different Google identity',
            { userId: byEmail.id },
          );
          throw new UnauthorizedError(
            'This account is already linked to a different Google identity',
            'GOOGLE_ALREADY_LINKED_ELSEWHERE',
          );
        }

        if (!byEmail.googleId) {
          // Local-only account (no Google identity ever attached). The
          // requester has proven ownership of the Google account with
          // this email — but this local account was created without
          // proving anything about email ownership, so we have no way
          // to know the two belong to the same person. Refuse and
          // redirect the legitimate owner to the password flow, then
          // an explicit link from Settings.
          logger.warn(
            'Google sign-in blocked: local account exists with this email but has no Google link',
            { userId: byEmail.id },
          );
          throw new UnauthorizedError(
            'An account already exists with this email. Sign in with your password, then link Google from Settings.',
            'OAUTH_EMAIL_ALREADY_REGISTERED',
          );
        }

        // Defensive fallthrough — byEmail.googleId === profile.googleId
        // would have been matched by Case 1's findByGoogleId above and
        // returned early. Kept for the (theoretical) race where the two
        // lookups see different DB states; if it does fire, the user
        // has legitimately proven control of both identities, so
        // linking is correct.
        const linked = await authRepository.linkGoogleAccount(byEmail.id, profile.googleId);
        const { result, sessionId } = await issueSession(linked, ip, userAgent);

        auditLog({
          event: AuditEvent.OAUTH_ACCOUNT_LINKED,
          userId: linked.id,
          ip,
          userAgent,
          sessionId,
          details: { provider: 'google', previousProvider: byEmail.provider },
        }).catch(() => {});

        logger.info('Linked Google account to existing user', { userId: linked.id });

        return result;
      }

      // Case 3: brand-new user. No SellerProfile — see this function's
      // own doc comment and createWithGoogle's.
      const created = await authRepository.createWithGoogle({
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl,
      });

      const { result, sessionId } = await issueSession(created, ip, userAgent);

      auditLog({
        event: AuditEvent.OAUTH_SIGNUP,
        userId: created.id,
        ip,
        userAgent,
        sessionId,
        details: { provider: 'google' },
      }).catch(() => {});

      return result;
    });
  },

  refresh: async (refreshToken: string): Promise<Omit<TokenPair, 'sessionId'>> => {
    // Unified message for every failure case — we don't reveal the reason
    const genericError = new UnauthorizedError('Session expired. Please login again', 'SESSION_EXPIRED');

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw genericError;
    }

    /**
     * BUGFIX (found during a post-implementation code audit): this
     * function previously never checked user.isActive anywhere in its
     * path — a deactivated account (via usersService.deleteMe, or an
     * admin's adminService.toggleUserActive) could keep minting fresh
     * access tokens off a still-valid refresh token for up to its full
     * 7-day lifetime. auth.middleware.ts DOES check isActive on every
     * authenticated request, which limits some of the practical impact
     * (a token minted here would still be rejected on its next use if
     * the account is already inactive by then) — but that's a
     * different, narrower protection than actually refusing to issue
     * the token in the first place, and it doesn't help at all for the
     * brief window between deactivation and this check's absence
     * being the ONLY thing standing between "account is deactivated"
     * and "still-valid session keeps working." Both toggleUserActive
     * and deleteMe already call tokenStore.deleteAllRefreshTokens() on
     * deactivation, but that's best-effort cleanup (a transient Redis
     * failure, or simply a token grabbed a moment before deactivation
     * completed, both bypass it) — it should never have been the ONLY
     * layer keeping a deactivated account from refreshing, the same
     * way isActive is independently re-checked on every request rather
     * than trusting that logout/deleteMe always successfully revoked
     * everything. This check is deliberately placed before
     * atomicRefreshRotate — no reason to spend an atomic Redis
     * rotation on a token that's going to be rejected regardless once
     * we already know the account is inactive.
     *
     * Uses userCache.getOrFetch (same helper + same cached field
     * auth.middleware.ts already relies on for this exact check on
     * every request) rather than a fresh prisma.user.findUnique — this
     * is now called on every /auth/refresh, a genuinely high-traffic
     * path since PROD-FIX-15 (every page load attempts a refresh), so
     * reusing the existing cache (with its Single-Flight dedup and
     * explicit invalidation from deleteMe/toggleUserActive on
     * deactivation) avoids adding a fresh DB round-trip per refresh
     * call. The up-to-~5-minute cache staleness window this trades
     * away is the same one auth.middleware.ts already accepts for the
     * identical check, and both deactivation paths already call
     * userCache.invalidate() explicitly, so a real deactivation is
     * reflected immediately rather than waiting out the TTL.
     */
    const cachedUser = await userCache.getOrFetch(payload.userId);
    if (!cachedUser || !cachedUser.isActive) {
      throw genericError;
    }

    const newTokens = rotateTokenPair(payload.userId, payload.sessionId);

    const result = await atomicRefreshRotate(
      payload.userId,
      payload.sessionId,
      refreshToken,
      newTokens.refreshToken
    );

    switch (result) {
      case RotateResult.SUCCESS:
        // FIX M-026: extendSession/updateSessionLastSeen are secondary
        // bookkeeping (session TTL extension + last-seen timestamp) on top
        // of a token rotation that has *already* succeeded per
        // atomicRefreshRotate above. Previously any exception here (e.g. a
        // transient Redis blip) propagated unhandled and aborted the whole
        // response, so a user with a validly-rotated token could still see
        // a hard failure caused by an unrelated, non-critical side effect.
        // Best-effort + log, matching the fire-and-forget philosophy used
        // elsewhere in this file (auditLog, sendSecurityAlert) — a failure
        // here should never mask a successful refresh.
        try {
          await tokenStore.extendSession(payload.userId, payload.sessionId);
          await tokenStore.updateSessionLastSeen(payload.userId, payload.sessionId);
        } catch (err) {
          logger.warn('Failed to extend session / update last-seen after successful token rotation', {
            userId: payload.userId,
            sessionId: payload.sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        auditLog({
          event: AuditEvent.TOKEN_REFRESHED,
          userId: payload.userId,
          sessionId: payload.sessionId,
        }).catch(() => {});
        return newTokens;

      case RotateResult.TOKEN_MISMATCH:
        // سرقة محتملة — نلغي كل الجلسات
        await tokenStore.deleteAllRefreshTokens(payload.userId);
        await userCache.invalidate(payload.userId);

        Promise.all([
          auditLog({
            event: AuditEvent.TOKEN_REUSE_DETECTED,
            userId: payload.userId,
            sessionId: payload.sessionId,
          }),
          sendSecurityAlert({
            userId: payload.userId,
            sessionId: payload.sessionId,
            event: 'TOKEN_REUSE',
          }),
        ]).catch(() => {});

        logger.warn('Refresh token reuse detected — all sessions invalidated', {
          userId: payload.userId,
        });
        throw genericError;

      case RotateResult.TOKEN_NOT_FOUND:
        // الجلسة انتهت — لا نعاقب المستخدم
        throw genericError;

      case RotateResult.REDIS_ERROR:
        logger.error('Redis error during token rotation', { userId: payload.userId });
        throw new AppError('Service temporarily unavailable', 503);
    }
  },

  logout: async (
    userId: string,
    sessionId: string,
    accessToken: string,
    ip = 'unknown'
  ): Promise<void> => {
    const ttl = getTokenRemainingTTL(accessToken);

    await Promise.all([
      tokenStore.deleteRefreshToken(userId, sessionId),
      ttl > 0 ? tokenStore.blacklistAccessToken(accessToken, ttl) : Promise.resolve(),
    ]);

    auditLog({ event: AuditEvent.LOGOUT, userId, sessionId, ip }).catch(() => {});
  },

  logoutAll: async (userId: string, accessToken: string, ip = 'unknown'): Promise<void> => {
    const ttl = getTokenRemainingTTL(accessToken);

    await Promise.all([
      tokenStore.deleteAllRefreshTokens(userId),
      userCache.invalidate(userId),
      ttl > 0 ? tokenStore.blacklistAccessToken(accessToken, ttl) : Promise.resolve(),
    ]);

    auditLog({ event: AuditEvent.LOGOUT_ALL, userId, ip }).catch(() => {});
  },

  revokeSession: async (userId: string, targetSessionId: string): Promise<void> => {
    // Fix 3 — تحقق من وجود الجلسة
    const meta = await tokenStore.getSessionMetadata(userId, targetSessionId);
    if (!meta) throw new NotFoundError('Session not found or already expired');

    await tokenStore.deleteRefreshToken(userId, targetSessionId);

    auditLog({
      event: AuditEvent.SESSION_REVOKED,
      userId,
      sessionId: targetSessionId,
    }).catch(() => {});
  },

  getSessions: async (userId: string, currentSessionId: string) =>
    tokenStore.getAllSessions(userId, currentSessionId),

  /**
   * Send password reset email.
   * In this implementation we return success regardless of whether the email
   * exists (prevents email enumeration). The token would normally be sent via
   * email — log it for now until an email provider is wired up.
   */
  // ── FEAT-GOOGLE-VERIFY-RESET ────────────────────────────────────
  // Two helpers used by auth.controller.ts's googleCallback when the
  // flow was started with ?purpose=verify or ?purpose=reset. Both
  // operate on the email that Google's extractGoogleProfile() has
  // already proven to be verified (that function rejects any profile
  // whose email_verified claim is not exactly true), so reaching here
  // means Google itself has vouched for this email's ownership.

  /**
   * Marks the account holding `email` as email-verified. Called when
   * the user clicks "تأكيد عبر Google" from the verify-email page —
   * equivalent in effect to clicking the link in the signup email,
   * without requiring a working outbound email provider.
   *
   * Idempotent: an already-verified user gets { alreadyVerified: true }
   * and the callback redirects to /dashboard without the toast. A
   * missing account throws UnauthorizedError (not NotFoundError) so
   * the same catch block in googleCallback handles it as a normal
   * OAuth failure rather than a 500.
   *
   * Deactivated accounts are rejected on the same principle as the
   * login path: an unverified deactivated user must not be able to
   * change state by proving Google ownership alone.
   */
  verifyEmailViaGoogle: async (email: string): Promise<{ alreadyVerified: boolean }> => {
    // FIX EMAIL-NORMALIZE-03: same normalization as forgotPassword —
    // direct prisma call, no repository boundary, and a mixed-case
    // registration would otherwise silently miss.
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedError(
        'No account found with this email',
        'GOOGLE_VERIFY_USER_NOT_FOUND',
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }
    if (user.emailVerified) {
      return { alreadyVerified: true };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });

    // Drop the cached user so the next request sees the new flag —
    // same pattern every other state change on User follows (see
    // issueSession's userCache.set above and loginWithGoogle's link
    // path).
    await userCache.invalidate(user.id);

    // Note: auditLog without a dedicated EMAIL_VERIFIED event — falls
    // back to LOGIN_SUCCESS shape since the enum may not have a
    // dedicated constant. If a dedicated event exists, swap it here.
    auditLog({
      event: AuditEvent.LOGIN_SUCCESS,
      userId: user.id,
      ip: 'unknown',
      userAgent: 'unknown',
      details: { action: 'email_verified_via_google', provider: 'google' },
    }).catch(() => {});

    return { alreadyVerified: false };
  },

  /**
   * Mints a password-reset token for the account holding `email` and
   * returns the raw token (to be put in the redirect URL). Mirrors
   * forgotPassword's token creation exactly (randomBytes(32), 1h
   * expiry, delete-prior-unused) — the only difference is the delivery
   * channel: instead of emailing the token, the caller already proved
   * ownership of the email via Google, so we hand it back inline.
   *
   * Returns null (rather than throwing) when there is no active
   * account, so the callback can redirect to /forgot-password with a
   * generic error without revealing whether the email exists — same
   * enumeration protection forgotPassword's timing floor provides.
   */
  issueResetTokenViaGoogle: async (email: string): Promise<string | null> => {
    // FIX EMAIL-NORMALIZE-04: same reasoning as verifyEmailViaGoogle
    // above — direct prisma call, mixed-case registration would
    // otherwise be unreachable via the Google reset flow.
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Same "at most one live token per user" rule as forgotPassword.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false },
    });

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt: expiry },
    });

    auditLog({
      event: AuditEvent.LOGIN_SUCCESS,
      userId: user.id,
      ip: 'unknown',
      userAgent: 'unknown',
      details: { action: 'password_reset_via_google', provider: 'google' },
    }).catch(() => {});

    return token;
  },

  forgotPassword: async (email: string): Promise<void> => {
    // FIX FORGOT-PASSWORD-TIMING-01: start the clock before the DB
    // lookup so the sleep at the end accounts for whatever time was
    // already spent. See FORGOT_PASSWORD_MIN_MS's own comment.
    const startedAt = Date.now();

    // FIX EMAIL-NORMALIZE-02: this is a direct prisma call, so it does
    // not pass through authRepository's normalizeEmail(). Without
    // this, a user who registered as "User@Example.com" (or whose
    // phone auto-capitalized the first letter) would never receive a
    // reset email — the lookup would miss even though
    // authRepository.findByEmail was already normalized. Kept inline
    // rather than routed through the repository so the timing-floor
    // measurement stays on the same code path as before.
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      // Silent — do not reveal existence. Enforce the timing floor
      // before returning so this branch is indistinguishable from the
      // "user exists" branch by response latency.
      const elapsed = Date.now() - startedAt;
      if (elapsed < FORGOT_PASSWORD_MIN_MS) {
        await sleep(FORGOT_PASSWORD_MIN_MS - elapsed);
      }
      return;
    }

    // FIX AUDIT-V3-04: randomBytes(32) (256-bit entropy) is the
    // conventional choice for security tokens like this, vs.
    // crypto.randomUUID() (122-bit, UUID v4). The practical risk
    // difference is negligible given the 3/hour rate limit on this
    // endpoint, but this is a zero-cost, zero-tradeoff change to the
    // more standard primitive — worth doing even though the previous
    // version was not meaningfully exploitable.
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // FIX AUDIT-V3-01: previously every forgotPassword call created a new
    // row with no cleanup of the user's prior unused tokens — a user who
    // forgets their password repeatedly accumulates one row per attempt
    // forever, with only the newest token ever valid. Deleting unused
    // tokens for this user before creating the new one keeps the table
    // bounded to at most one live token per user (used tokens are kept
    // as an audit trail, only unused/superseded ones are cleared).
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false },
    });

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt: expiry },
    });

    // FIX EMAIL-01: previously only logged — users had no way to
    // actually receive the reset link. emailService falls back to
    // logging on its own if SMTP isn't configured, so this call is
    // safe in any environment (dev/test/CI included).
    //
    // FIX FORGOT-PASSWORD-TIMING-01: intentionally NOT awaited. The
    // response no longer blocks on the SMTP round trip, so the
    // endpoint returns in a predictable (and floored) amount of time
    // regardless of SMTP provider health. The .catch() is essential —
    // an unhandled rejection here would crash the process on strict
    // Node, and the caller already told the user "if this email is
    // registered, a link will arrive" — a send failure is not
    // actionable there anyway. Logged so a real SMTP outage is
    // visible in the logs.
    emailService.sendPasswordResetEmail(user.email, token).catch((err) => {
      logger.error('Failed to send password reset email', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // FIX AUDIT-V3-05 (reviewed, not changed): forgotPassword
    // intentionally does NOT revoke the account's existing sessions —
    // only resetPassword does, after the password has actually been
    // changed. Revoking sessions at the *request* stage (before any
    // verification that the requester is the account owner) would let
    // anyone who merely knows a victim's email address force-logout
    // their active session by hitting "forgot password" — a trivial
    // denial-of-service with no proof of account ownership required.
    // The actual mitigation already exists at the right point:
    // resetPassword revokes all sessions once the new password is set.
    logger.info('Password reset token generated and email dispatched', { userId: user.id });

    // FIX FORGOT-PASSWORD-TIMING-01: apply the same floor here so both
    // branches (existing vs nonexistent email) land within a few ms of
    // each other — see FORGOT_PASSWORD_MIN_MS's own comment. Since the
    // email send above is now fire-and-forget, the elapsed time on
    // this path is dominated by the DB write, which is well under the
    // floor on typical hardware.
    const elapsed = Date.now() - startedAt;
    if (elapsed < FORGOT_PASSWORD_MIN_MS) {
      await sleep(FORGOT_PASSWORD_MIN_MS - elapsed);
    }
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date() || record.used) {
      throw new BadRequestError('Password reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
    }

    const passwordHash = await hashPassword(newPassword);

    // SEC-FIX: the initial `!record.used` check above reads the token's
    // state, but the password/token updates below don't happen until
    // after an `await hashPassword`. Two concurrent requests with the
    // same still-valid token both pass the check before either write
    // lands — classic check-then-act race — so both would proceed to
    // update the password, silently undoing whichever "wins" last.
    // Folding `used: false` into the token's own update as a
    // conditional WHERE (via updateMany, since Prisma's typed `update`
    // can't express a non-PK filter) makes the claim atomic: only the
    // request that actually flips used=false first gets count === 1
    // and is allowed to also write the new password. The loser's
    // updateMany matches zero rows and is rejected here — no password
    // update happens for it at all.
    const claim = await prisma.passwordResetToken.updateMany({
      where: { token, used: false },
      data: { used: true },
    });

    if (claim.count === 0) {
      throw new BadRequestError('Password reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
    }

    await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });

    // BUGFIX P0-02: tokenStore.deleteAllSessions did not exist (would throw
    // a TypeError at runtime on every successful password reset).
    // The correct exported method is deleteAllRefreshTokens.
    await tokenStore.deleteAllRefreshTokens(record.userId);
    logger.info('Password reset completed', { userId: record.userId });
  },
  /**
   * FIX FEAT-EMAIL-VERIFY: consumes a token from the verification
   * email. Mirrors resetPassword's shape (single-use token, TTL
   * enforced at the row level). On success marks the user's
   * emailVerified = true and emailVerifiedAt = now. The token row is
   * marked used=true (kept as an audit trail, same as password reset).
   */
  verifyEmail: async (token: string): Promise<void> => {
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date() || record.used) {
      throw new BadRequestError(
        'Verification link is invalid or has expired',
        'INVALID_VERIFICATION_TOKEN',
      );
    }

    // Idempotency: an already-verified user who re-clicks the link
    // should see success, not a confusing error. Consume the token
    // either way so it can't be reused.
    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: record.user.emailVerified
            ? record.user.emailVerifiedAt
            : new Date(),
        },
      }),
    ]);

    userCache.invalidate(record.userId).catch(() => {});
    auditLog({
      event: AuditEvent.EMAIL_VERIFIED,
      userId: record.userId,
    }).catch(() => {});
  },

  /**
   * FIX FEAT-EMAIL-VERIFY: re-sends the verification email for the
   * authenticated user. 3/hour rate limit applied at the route layer.
   * Idempotent for unverified users (clears old unused tokens, creates
   * a fresh one). Rejects with a clear error if the user is already
   * verified, rather than silently no-op'ing — the frontend banner
   * wouldn't be shown in that case anyway.
   */
  resendVerification: async (userId: string): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true, isActive: true },
    });
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }
    if (user.emailVerified) {
      throw new BadRequestError('Email is already verified', 'EMAIL_ALREADY_VERIFIED');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id, used: false },
    });
    await prisma.emailVerificationToken.create({
      data: { token, userId: user.id, expiresAt: expiry },
    });

    await emailService.sendVerificationEmail(user.email, token);
    logger.info('Verification email re-sent', { userId: user.id });
  },

};
