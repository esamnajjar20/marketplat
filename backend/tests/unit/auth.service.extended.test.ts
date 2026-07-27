import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { userCache } from '../../src/shared/utils/userCache';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { AppError } from '../../src/shared/errors/AppError';

jest.mock('../../src/modules/auth/auth.repository');
jest.mock('../../src/shared/utils/tokenStore');
jest.mock('../../src/shared/utils/userCache');
jest.mock('../../src/shared/utils/auditLog', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  AuditEvent: {
    LOGOUT: 'LOGOUT',
    LOGOUT_ALL: 'LOGOUT_ALL',
    SESSION_REVOKED: 'SESSION_REVOKED',
    TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
    TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  },
}));
jest.mock('../../src/shared/utils/securityAlert', () => ({
  sendSecurityAlert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/shared/utils/jwt', () => ({
  verifyRefreshToken: jest.fn().mockReturnValue({ userId: 'user-123', sessionId: 'session-1' }),
  rotateTokenPair: jest.fn().mockReturnValue({
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    sessionId: 'session-1',
  }),
  getTokenRemainingTTL: jest.fn().mockReturnValue(900),
}));
jest.mock('../../src/shared/utils/refreshLock', () => ({
  atomicRefreshRotate: jest.fn(),
  RotateResult: {
    SUCCESS: 'SUCCESS',
    TOKEN_MISMATCH: 'TOKEN_MISMATCH',
    TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
    REDIS_ERROR: 'REDIS_ERROR',
  },
}));

const { atomicRefreshRotate, RotateResult } = require('../../src/shared/utils/refreshLock');

describe('AuthService — extended', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStore.deleteRefreshToken as jest.Mock).mockResolvedValue(undefined);
    (tokenStore.deleteAllRefreshTokens as jest.Mock).mockResolvedValue(undefined);
    (tokenStore.blacklistAccessToken as jest.Mock).mockResolvedValue(undefined);
    (tokenStore.getSessionMetadata as jest.Mock).mockResolvedValue({ createdAt: Date.now() });
    (tokenStore.getAllSessions as jest.Mock).mockResolvedValue([{ sessionId: 'session-1', isCurrent: true }]);
    (userCache.invalidate as jest.Mock).mockResolvedValue(undefined);
    // BUGFIX (found during a post-implementation code audit):
    // authService.refresh() now checks userCache.getOrFetch(...).isActive
    // before rotating tokens (see auth.service.ts's own comment on that
    // check for why). userCache is fully jest.mock()'d in this file, so
    // without this default every refresh() test would get `undefined`
    // back from getOrFetch and fail the isActive check regardless of
    // what it's actually testing — this default represents "the normal
    // case: an active user," matching what every pre-existing test in
    // this describe block already assumed implicitly. Tests that
    // specifically need an inactive/missing user override this per-test.
    (userCache.getOrFetch as jest.Mock).mockResolvedValue({
      id: 'user-123',
      role: 'USER',
      isActive: true,
    });
  });

  describe('refresh', () => {
    it('returns new tokens on success', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.SUCCESS);
      (tokenStore.extendSession as jest.Mock).mockResolvedValue(undefined);
      (tokenStore.updateSessionLastSeen as jest.Mock).mockResolvedValue(undefined);

      const result = await authService.refresh('valid-refresh-token');
      expect(result.accessToken).toBe('new-access');
    });

    it('throws 503 on REDIS_ERROR', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.REDIS_ERROR);
      await expect(authService.refresh('token')).rejects.toThrow(AppError);
    });

    it('throws on TOKEN_NOT_FOUND', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.TOKEN_NOT_FOUND);
      await expect(authService.refresh('token')).rejects.toThrow('Session expired');
    });

    it('invalidates all sessions on TOKEN_MISMATCH', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.TOKEN_MISMATCH);
      jest.spyOn(tokenStore, 'deleteAllRefreshTokens').mockResolvedValue(undefined);
      jest.spyOn(userCache, 'invalidate').mockResolvedValue(undefined);

      await expect(authService.refresh('token')).rejects.toThrow('Session expired');
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalled();
    });

    /**
     * BUGFIX regression tests — found during a post-implementation code
     * audit. authService.refresh() previously never checked
     * user.isActive anywhere in its path: a deactivated account (via
     * usersService.deleteMe, or an admin's adminService.toggleUserActive)
     * could keep minting fresh access tokens off a still-valid refresh
     * token for up to its full 7-day lifetime, since nothing on this
     * specific path ever asked the database/cache whether the account
     * was still active. See auth.service.ts's own comment on the fix
     * for the full reasoning.
     */
    it('BUGFIX: rejects refresh for a deactivated account, even with a structurally valid refresh token', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.SUCCESS);
      (userCache.getOrFetch as jest.Mock).mockResolvedValue({
        id: 'user-123',
        role: 'USER',
        isActive: false,
      });

      await expect(authService.refresh('valid-refresh-token')).rejects.toThrow('Session expired');
    });

    it('BUGFIX: rejects refresh when the user no longer exists at all (cache/DB both miss)', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.SUCCESS);
      (userCache.getOrFetch as jest.Mock).mockResolvedValue(null);

      await expect(authService.refresh('valid-refresh-token')).rejects.toThrow('Session expired');
    });

    it('BUGFIX: does not attempt token rotation at all for a deactivated account (fails fast before the atomic Redis op)', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.SUCCESS);
      (userCache.getOrFetch as jest.Mock).mockResolvedValue({
        id: 'user-123',
        role: 'USER',
        isActive: false,
      });

      await expect(authService.refresh('valid-refresh-token')).rejects.toThrow();

      // The whole point of checking isActive before rotation: no reason
      // to spend an atomic Redis rotation on a token that's going to be
      // rejected regardless.
      expect(atomicRefreshRotate).not.toHaveBeenCalled();
    });

    it('still succeeds for an active account (confirms the new check does not break the normal path)', async () => {
      atomicRefreshRotate.mockResolvedValue(RotateResult.SUCCESS);
      (tokenStore.extendSession as jest.Mock).mockResolvedValue(undefined);
      (tokenStore.updateSessionLastSeen as jest.Mock).mockResolvedValue(undefined);
      (userCache.getOrFetch as jest.Mock).mockResolvedValue({
        id: 'user-123',
        role: 'USER',
        isActive: true,
      });

      const result = await authService.refresh('valid-refresh-token');
      expect(result.accessToken).toBe('new-access');
    });
  });

  describe('logout', () => {
    it('deletes refresh token and blacklists access token', async () => {
      await authService.logout('user-123', 'session-1', 'access-token', '127.0.0.1');
      expect(tokenStore.deleteRefreshToken).toHaveBeenCalledWith('user-123', 'session-1');
      expect(tokenStore.blacklistAccessToken).toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('revokes all sessions and invalidates cache', async () => {
      await authService.logoutAll('user-123', 'access-token', '127.0.0.1');
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalledWith('user-123');
      expect(userCache.invalidate).toHaveBeenCalledWith('user-123');
    });
  });

  describe('revokeSession', () => {
    it('throws when session not found', async () => {
      (tokenStore.getSessionMetadata as jest.Mock).mockResolvedValue(null);
      await expect(authService.revokeSession('user-123', 'missing-session')).rejects.toThrow(NotFoundError);
    });

    it('deletes session when found', async () => {
      await authService.revokeSession('user-123', 'session-2');
      expect(tokenStore.deleteRefreshToken).toHaveBeenCalledWith('user-123', 'session-2');
    });
  });

  describe('getSessions', () => {
    it('returns sessions from tokenStore', async () => {
      const sessions = await authService.getSessions('user-123', 'session-1');
      expect(sessions).toHaveLength(1);
    });
  });
});
