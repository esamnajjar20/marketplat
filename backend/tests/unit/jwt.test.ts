import {
  signAccessToken, signRefreshToken,
  verifyAccessToken, verifyRefreshToken,
  signTokenPair, rotateTokenPair,
  getTokenRemainingTTL,
} from '../../src/shared/utils/jwt';

const userId    = 'user-123';
const sessionId = 'session-456';

describe('JWT Utils', () => {
  it('should sign and verify access token', () => {
    const token   = signAccessToken(userId, sessionId);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(userId);
    expect(decoded.sessionId).toBe(sessionId);
  });

  it('should throw on invalid access token', () => {
    expect(() => verifyAccessToken('invalid.token')).toThrow();
  });

  it('should sign and verify refresh token', () => {
    const token   = signRefreshToken(userId, sessionId);
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(userId);
    expect(decoded.sessionId).toBe(sessionId);
  });

  it('signTokenPair should return both tokens with sessionId', () => {
    const pair = signTokenPair(userId);
    expect(pair.accessToken).toBeDefined();
    expect(pair.refreshToken).toBeDefined();
    expect(pair.sessionId).toBeDefined();
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });

  it('rotateTokenPair should keep same sessionId', () => {
    const rotated = rotateTokenPair(userId, sessionId);
    const decoded = verifyAccessToken(rotated.accessToken);
    expect(decoded.sessionId).toBe(sessionId);
  });

  it('getTokenRemainingTTL returns positive value for valid token', () => {
    const token = signAccessToken(userId, sessionId);
    expect(getTokenRemainingTTL(token)).toBeGreaterThan(0);
  });

  it('getTokenRemainingTTL returns 0 for invalid token', () => {
    expect(getTokenRemainingTTL('not-a-jwt')).toBe(0);
  });
});
