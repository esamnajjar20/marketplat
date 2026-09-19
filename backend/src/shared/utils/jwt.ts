import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../../config/env';

// payload يحتوي userId + sessionId فقط — Role تُجلب من Cache
export interface JwtPayload {
  userId: string;
  sessionId: string;
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  // FIX BUG-06: seconds until accessToken expires — lets the frontend
  // derive its access-token cookie's maxAge from the backend's actual
  // configured TTL (env.jwt.expiresInSeconds) instead of a hardcoded
  // constant. Always equal to env.jwt.expiresInSeconds at the moment
  // of signing; carried per-response (rather than a static import on
  // the frontend) so a JWT_EXPIRES_IN change takes effect for clients
  // on their very next login/refresh with no frontend deploy needed.
  expiresIn: number;
}

const generateJti = (): string => crypto.randomBytes(16).toString('hex');

const JWT_ISSUER = 'classifieds-platform';
const JWT_AUDIENCE = 'classifieds-platform-client';

export const signAccessToken = (userId: string, sessionId: string): string =>
  jwt.sign({ userId, sessionId, jti: generateJti() }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);

export const signRefreshToken = (userId: string, sessionId: string): string =>
  jwt.sign({ userId, sessionId, jti: generateJti() }, env.jwt.refreshSecret, {
    // Was hardcoded as '7d' here — now driven by env.jwt.refreshExpiresIn
    // (JWT_REFRESH_EXPIRES_IN), which authCookies.ts's cookie maxAge also
    // derives from, so the two can no longer drift out of sync.
    expiresIn: env.jwt.refreshExpiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);

// sessionId يُولَّد مرة واحدة عند Login
export const signTokenPair = (userId: string): TokenPair => {
  const sessionId = crypto.randomUUID();
  return {
    accessToken: signAccessToken(userId, sessionId),
    refreshToken: signRefreshToken(userId, sessionId),
    sessionId,
    expiresIn: env.jwt.expiresInSeconds,
  };
};

// Refresh يحتفظ بنفس sessionId
export const rotateTokenPair = (
  userId: string,
  sessionId: string
): Omit<TokenPair, 'sessionId'> => ({
  accessToken: signAccessToken(userId, sessionId),
  refreshToken: signRefreshToken(userId, sessionId),
  expiresIn: env.jwt.expiresInSeconds,
});

// FIX JWT-ALG-PIN-01: pass an explicit algorithms allow-list on every
// verify. jsonwebtoken already refuses `alg: none` unconditionally,
// but without a pinned algorithm it will accept whichever HMAC variant
// the token header advertises (HS256/384/512). That's not exploitable
// today — all our tokens are signed with HS256 — but it becomes a
// real algorithm-confusion vector the day any part of the system is
// migrated to an asymmetric algorithm (RS256/ES256) while this
// symmetric secret is still accepted as if it were the public key.
// Pinning to HS256 keeps the contract explicit and refuses anything
// else at the verify layer.
export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, env.jwt.secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, env.jwt.refreshSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayload;

export const getTokenRemainingTTL = (token: string): number => {
  try {
    const decoded = jwt.decode(token) as { exp?: number };
    if (!decoded?.exp) return 0;
    return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
};
