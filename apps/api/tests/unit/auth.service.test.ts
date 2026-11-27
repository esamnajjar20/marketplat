import { authService } from '../../src/modules/identity/auth/auth.service';
import { authRepository } from '../../src/modules/identity/auth/auth.repository';
import { hashPassword } from '../../src/shared/auth/hash';
import { tokenStore } from '../../src/shared/auth/tokenStore';
import { userCache } from '../../src/shared/cache/userCache';
import { prisma } from '../../src/config/prisma';
import { signTokenPair } from '../../src/shared/auth/jwt';

jest.mock('../../src/modules/identity/auth/auth.repository');
jest.mock('../../src/shared/auth/tokenStore');
jest.mock('../../src/shared/cache/userCache');
jest.mock('../../src/shared/audit/auditLog', () => ({ auditLog: jest.fn().mockResolvedValue(undefined), AuditEvent: { REGISTER: 'REGISTER', LOGIN_SUCCESS: 'LOGIN_SUCCESS', LOGIN_FAILED: 'LOGIN_FAILED' } }));
jest.mock('../../src/shared/auth/securityAlert', () => ({ sendSecurityAlert: jest.fn().mockResolvedValue(undefined) }));

const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: '',
  role: 'USER' as const,
  phone: null, city: null, bio: null, avatarUrl: null,
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
};

describe('AuthService', () => {
  beforeAll(async () => { mockUser.passwordHash = await hashPassword('password123'); });

  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStore.saveRefreshToken as jest.Mock).mockResolvedValue(undefined);
    (tokenStore.isSessionActive as jest.Mock).mockResolvedValue(true);
    (tokenStore.isAccountLocked as jest.Mock).mockResolvedValue(false);
    (tokenStore.getIpStats as jest.Mock).mockResolvedValue({ attempts: 0, distinctEmails: 0 });
    (tokenStore.clearFailedLogins as jest.Mock).mockResolvedValue(undefined);
    (userCache.set as jest.Mock).mockResolvedValue(undefined);
    (userCache.invalidate as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('register', () => {
    it('should register successfully', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.findByPhone as jest.Mock).mockResolvedValue(null);
      (authRepository.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' });
      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('revokes a partially-created session when session setup fails', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.findByPhone as jest.Mock).mockResolvedValue(null);
      (authRepository.create as jest.Mock).mockResolvedValue(mockUser);
      (userCache.set as jest.Mock).mockRejectedValueOnce(new Error('cache unavailable'));

      await expect(
        authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' })
      ).rejects.toMatchObject({ statusCode: 503 });

      expect(tokenStore.deleteRefreshToken).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String)
      );
      expect(authRepository.deleteById).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw if email exists', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      await expect(authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Email already in use');
    });

    // Frontend distinguishes the email-taken vs phone-taken case (which
    // FormField gets the error) by `error.code`, not by parsing the
    // English message — asserting the code here is what actually pins
    // down the register() -> RegisterForm.tsx contract.
    it('should attach the EMAIL_ALREADY_EXISTS code when email exists', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      await expect(authService.register({ name: 'Test', email: 'test@example.com', password: 'password123' }))
        .rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 400 });
    });

    it('should throw if phone exists', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.findByPhone as jest.Mock).mockResolvedValue(mockUser);
      await expect(
        authService.register({ name: 'Test', email: 'new@example.com', password: 'password123', phone: '+966501111111' })
      ).rejects.toThrow('Phone number already in use');
    });

    it('should attach the PHONE_ALREADY_EXISTS code when phone exists', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.findByPhone as jest.Mock).mockResolvedValue(mockUser);
      await expect(
        authService.register({ name: 'Test', email: 'new@example.com', password: 'password123', phone: '+966501111111' })
      ).rejects.toMatchObject({ code: 'PHONE_ALREADY_EXISTS', statusCode: 400 });
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      const result = await authService.login({ email: 'test@example.com', password: 'password123' });
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('should throw for wrong password', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 1, ipAttempts: 1, attempts: 1, distinctEmails: 1 });
      await expect(authService.login({ email: 'test@example.com', password: 'wrong' }))
        .rejects.toThrow('Invalid email or password');
    });

    it('should throw for non-existent user', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 1, ipAttempts: 1, attempts: 1, distinctEmails: 1 });
      await expect(authService.login({ email: 'nobody@example.com', password: 'password123' }))
        .rejects.toThrow('Invalid email or password');
    });

    it('should throw for deactivated account', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });
      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Account is deactivated');
    });

    // FIX LOGIN-DEACTIVATED-ORACLE-01: the deactivated state must only be
    // revealed to someone who proved the password. A wrong password on a
    // deactivated account must look exactly like a wrong password anywhere
    // else — same error, and it still feeds the lockout counter.
    it('does NOT reveal a deactivated account when the password is wrong', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });
      (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 1, ipAttempts: 1, attempts: 1, distinctEmails: 1 });

      await expect(authService.login({ email: 'test@example.com', password: 'wrong' }))
        .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
      expect(tokenStore.incrementFailedLogins).toHaveBeenCalledTimes(1);
    });

    it('reveals ACCOUNT_DEACTIVATED (without issuing a session) when the password is right', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });

      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toMatchObject({ code: 'ACCOUNT_DEACTIVATED', statusCode: 401 });
      expect(tokenStore.saveRefreshToken).not.toHaveBeenCalled();
      expect(tokenStore.clearFailedLogins).not.toHaveBeenCalled();
    });

    it('should throw when account is locked', async () => {
      (tokenStore.isAccountLocked as jest.Mock).mockResolvedValue(true);
      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Account temporarily locked');
    });

    it('should throw when IP is rate limited', async () => {
      (tokenStore.getIpStats as jest.Mock).mockResolvedValue({ attempts: 500, distinctEmails: 0 });
      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Too many requests from this network');
    });
  });

  describe('verifyGoogleReauthForSession', () => {
    it('rejects a refresh token whose Redis session metadata has been revoked', async () => {
      const pair = signTokenPair(mockUser.id);
      (tokenStore.isSessionActive as jest.Mock).mockResolvedValue(false);

      await expect(authService.verifyGoogleReauthForSession(pair.refreshToken, {
        googleId: 'google-subject-1', email: mockUser.email, name: 'Test User',
      })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      expect(tokenStore.validateRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('verifyGoogleReauthForSessionIdentity', () => {
    it('accepts the linked Google subject only while the initiating session is active', async () => {
      (tokenStore.isSessionActive as jest.Mock).mockResolvedValue(true);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUser.id, email: mockUser.email, googleId: 'google-subject-1', isActive: true,
      } as any);

      await expect(authService.verifyGoogleReauthForSessionIdentity(
        mockUser.id,
        'session-native-delete',
        { googleId: 'google-subject-1', email: 'TEST@example.com', name: 'Test User' }
      )).resolves.toBe(mockUser.id);
      expect(tokenStore.isSessionActive).toHaveBeenCalledWith(mockUser.id, 'session-native-delete');
    });

    it('rejects a revoked initiating session before looking up the Google identity', async () => {
      (tokenStore.isSessionActive as jest.Mock).mockResolvedValue(false);
      const findUser = jest.spyOn(prisma.user, 'findUnique');

      await expect(authService.verifyGoogleReauthForSessionIdentity(
        mockUser.id,
        'revoked-session',
        { googleId: 'google-subject-1', email: mockUser.email, name: 'Test User' }
      )).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      expect(findUser).not.toHaveBeenCalled();
    });
  });

  describe('assertGoogleDeletionAvailable', () => {
    it('requires an active linked Google identity and an active session', async () => {
      (tokenStore.isSessionActive as jest.Mock).mockResolvedValue(true);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ googleId: 'google-subject-1', isActive: true } as any);
      await expect(authService.assertGoogleDeletionAvailable(mockUser.id, 'session-1')).resolves.toBeUndefined();
    });

    it('rejects accounts without a linked Google identity', async () => {
      (tokenStore.isSessionActive as jest.Mock).mockResolvedValue(true);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ googleId: null, isActive: true } as any);
      await expect(authService.assertGoogleDeletionAvailable(mockUser.id, 'session-1'))
        .rejects.toMatchObject({ code: 'GOOGLE_REAUTH_UNAVAILABLE' });
    });
  });

  describe('verifyGoogleReauthForSession', () => {
    it('accepts only the linked Google identity on a live session', async () => {
      const pair = signTokenPair(mockUser.id);
      (tokenStore.validateRefreshToken as jest.Mock).mockResolvedValue(true);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        googleId: 'google-subject-1',
        isActive: true,
      } as any);

      await expect(authService.verifyGoogleReauthForSession(pair.refreshToken, {
        googleId: 'google-subject-1',
        email: 'TEST@example.com',
        name: 'Test User',
      })).resolves.toBe(mockUser.id);
      expect(tokenStore.validateRefreshToken).toHaveBeenCalledWith(
        mockUser.id, pair.sessionId, pair.refreshToken
      );
    });

    it('rejects a valid Google account that is not linked to this user', async () => {
      const pair = signTokenPair(mockUser.id);
      (tokenStore.validateRefreshToken as jest.Mock).mockResolvedValue(true);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUser.id, email: mockUser.email, googleId: 'different-subject', isActive: true,
      } as any);

      await expect(authService.verifyGoogleReauthForSession(pair.refreshToken, {
        googleId: 'attacker-subject', email: mockUser.email, name: 'Other User',
      })).rejects.toMatchObject({ code: 'GOOGLE_REAUTH_MISMATCH' });
    });

    it('rejects a refresh token that is no longer active', async () => {
      const pair = signTokenPair(mockUser.id);
      (tokenStore.validateRefreshToken as jest.Mock).mockResolvedValue(false);

      await expect(authService.verifyGoogleReauthForSession(pair.refreshToken, {
        googleId: 'google-subject-1', email: mockUser.email, name: 'Test User',
      })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('creates a reset token for an existing, active user', async () => {
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValue(mockUser as any);
      const createSpy = jest.spyOn(prisma.passwordResetToken, 'create').mockResolvedValue({} as any);

      await authService.forgotPassword('test@example.com');

      expect(createSpy).toHaveBeenCalledTimes(1);
      const callArg = createSpy.mock.calls[0][0] as any;
      expect(callArg.data.userId).toBe(mockUser.id);
      expect(callArg.data.token).toBeNull();
      expect(callArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('sets an expiry roughly 1 hour in the future', async () => {
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValue(mockUser as any);
      const createSpy = jest.spyOn(prisma.passwordResetToken, 'create').mockResolvedValue({} as any);

      const before = Date.now();
      await authService.forgotPassword('test@example.com');
      const after = Date.now();

      const callArg = createSpy.mock.calls[0][0] as any;
      const expiresAt = (callArg.data.expiresAt as Date).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 61 * 60 * 1000);
    });

    it('silently does nothing for a non-existent email (no enumeration)', async () => {
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValue(null);
      const createSpy = jest.spyOn(prisma.passwordResetToken, 'create');

      await expect(authService.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('silently does nothing for a deactivated account (no enumeration)', async () => {
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValue({ ...mockUser, isActive: false } as any);
      const createSpy = jest.spyOn(prisma.passwordResetToken, 'create');

      await expect(authService.forgotPassword('test@example.com')).resolves.toBeUndefined();
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const futureDate = () => new Date(Date.now() + 30 * 60 * 1000);
    const pastDate   = () => new Date(Date.now() - 30 * 60 * 1000);

    it('updates the password and revokes all sessions on a valid token', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        id: 'reset-token-1', token: 'valid-token', tokenHash: null, userId: mockUser.id, expiresAt: futureDate(), used: false,
        user: mockUser,
      } as any);
      jest.spyOn(prisma.passwordResetToken, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(prisma) as any);
      (tokenStore.deleteAllRefreshTokens as jest.Mock).mockResolvedValue(undefined);

      await authService.resetPassword('valid-token', 'newPassword123');

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'reset-token-1',
          used: false,
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        data: { used: true, token: null, tokenHash: expect.any(String) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { passwordHash: expect.any(String) },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalledWith(mockUser.id);
    });

    // FIX AUTH-RESET-UNLOCK-01
    it('lifts the login lockout (normalized email) after a successful reset', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        id: 'reset-token-1', token: 'valid-token', tokenHash: null, userId: mockUser.id, expiresAt: futureDate(), used: false,
        user: { ...mockUser, email: '  Test@Example.com ' },
      } as any);
      jest.spyOn(prisma.passwordResetToken, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(prisma) as any);
      (tokenStore.deleteAllRefreshTokens as jest.Mock).mockResolvedValue(undefined);
      (tokenStore.clearLoginLockout as jest.Mock).mockResolvedValue(undefined);

      await authService.resetPassword('valid-token', 'newPassword123');

      expect(tokenStore.clearLoginLockout).toHaveBeenCalledWith('test@example.com');
    });

    it('still succeeds when lifting the lockout fails (best-effort side effect)', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        id: 'reset-token-1', token: 'valid-token', tokenHash: null, userId: mockUser.id, expiresAt: futureDate(), used: false,
        user: mockUser,
      } as any);
      jest.spyOn(prisma.passwordResetToken, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(prisma) as any);
      (tokenStore.deleteAllRefreshTokens as jest.Mock).mockResolvedValue(undefined);
      (tokenStore.clearLoginLockout as jest.Mock).mockRejectedValue(new Error('redis down'));

      await expect(authService.resetPassword('valid-token', 'newPassword123')).resolves.toBeUndefined();
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalledWith(mockUser.id);
    });

    it('does not lift the lockout when the token is rejected', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(null);

      await expect(authService.resetPassword('bad-token', 'newPassword123')).rejects.toThrow();
      expect(tokenStore.clearLoginLockout).not.toHaveBeenCalled();
    });

    it('does not update the password when the token expires before the atomic claim', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        id: 'reset-token-race', token: 'racing-token', tokenHash: null, userId: mockUser.id, expiresAt: futureDate(), used: false,
        user: mockUser,
      } as any);
      jest.spyOn(prisma.passwordResetToken, 'updateMany').mockResolvedValue({ count: 0 } as any);
      const userUpdate = jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(prisma) as any);

      await expect(authService.resetPassword('racing-token', 'newPassword123'))
        .rejects.toThrow('Password reset link is invalid or has expired');
      expect(userUpdate).not.toHaveBeenCalled();
      expect(tokenStore.deleteAllRefreshTokens).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(null);

      await expect(authService.resetPassword('bad-token', 'newPassword123'))
        .rejects.toThrow('Password reset link is invalid or has expired');
    });

    it('rejects an expired token', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        id: 'reset-token-expired', token: 'expired-token', tokenHash: null, userId: mockUser.id, expiresAt: pastDate(), used: false,
        user: mockUser,
      } as any);

      await expect(authService.resetPassword('expired-token', 'newPassword123'))
        .rejects.toThrow('Password reset link is invalid or has expired');
    });

    it('rejects an already-used token (prevents replay)', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        id: 'reset-token-used', token: 'used-token', tokenHash: null, userId: mockUser.id, expiresAt: futureDate(), used: true,
        user: mockUser,
      } as any);

      await expect(authService.resetPassword('used-token', 'newPassword123'))
        .rejects.toThrow('Password reset link is invalid or has expired');
    });

    it('does not call deleteAllRefreshTokens when the token is invalid', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(null);

      await expect(authService.resetPassword('bad-token', 'newPassword123')).rejects.toThrow();
      expect(tokenStore.deleteAllRefreshTokens).not.toHaveBeenCalled();
    });
  });
});
