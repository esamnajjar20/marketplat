import { authRepository } from './auth.repository';
import { prisma } from '../../config/prisma';
import crypto from 'crypto';
import { hashPassword, comparePassword } from '../../shared/utils/hash';
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
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { UnauthorizedError } from '../../shared/errors/UnauthorizedError';
import { TooManyRequestsError } from '../../shared/errors/TooManyRequestsError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { AppError } from '../../shared/errors/AppError';
import { RegisterInput, LoginInput } from './auth.validation';
import { logger } from '../../shared/utils/logger';

const MAX_EMAIL_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 50;
const LOCKOUT_DURATION = 30 * 60;

export interface AuthResult {
  tokens: Omit<TokenPair, 'sessionId'>;
  user: { id: string; name: string; email: string; role: string };
}

/**
 * Issues a new session for a user who just registered or logged in:
 * signs the token pair, persists the refresh token, warms the user cache,
 * and shapes the AuthResult. register() and login() differ only in which
 * audit event they log (and login's also includes the sessionId), so this
 * shared setup is factored out rather than duplicated in both places.
 */
async function issueSession(
  user: { id: string; name: string; email: string; role: string },
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

  await userCache.set({ id: user.id, role: user.role, isActive: true });

  return {
    sessionId: tokens.sessionId,
    result: {
      tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
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
    if (existingEmail) throw new BadRequestError('Email already in use');

    if (input.phone) {
      const existingPhone = await authRepository.findByPhone(input.phone);
      if (existingPhone) throw new BadRequestError('Phone number already in use');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      phone: input.phone,
      city: input.city,
    });

    const { result } = await issueSession(user, ip, userAgent);

    auditLog({ event: AuditEvent.REGISTER, userId: user.id, ip, userAgent }).catch(() => {});

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

    if (!user) {
      const { emailAttempts } = await tokenStore.incrementFailedLogins(input.email, ip);
      if (emailAttempts >= MAX_EMAIL_ATTEMPTS) {
        await tokenStore.lockAccount(input.email, LOCKOUT_DURATION);
      }
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_DEACTIVATED');

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);

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
        await tokenStore.extendSession(payload.userId, payload.sessionId);
        await tokenStore.updateSessionLastSeen(payload.userId, payload.sessionId);
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
  forgotPassword: async (email: string): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return; // silent — don't reveal existence

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
    await emailService.sendPasswordResetEmail(user.email, token);

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

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { token }, data: { used: true } }),
    ]);

    // BUGFIX P0-02: tokenStore.deleteAllSessions did not exist (would throw
    // a TypeError at runtime on every successful password reset).
    // The correct exported method is deleteAllRefreshTokens.
    await tokenStore.deleteAllRefreshTokens(record.userId);
    logger.info('Password reset completed', { userId: record.userId });
  },
};
