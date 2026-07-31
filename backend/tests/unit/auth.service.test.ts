import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { hashPassword } from '../../src/shared/utils/hash';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { userCache } from '../../src/shared/utils/userCache';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/modules/auth/auth.repository');
jest.mock('../../src/shared/utils/tokenStore');
jest.mock('../../src/shared/utils/userCache');
jest.mock('../../src/shared/utils/auditLog', () => ({ auditLog: jest.fn().mockResolvedValue(undefined), AuditEvent: { REGISTER: 'REGISTER', LOGIN_SUCCESS: 'LOGIN_SUCCESS', LOGIN_FAILED: 'LOGIN_FAILED' } }));
jest.mock('../../src/shared/utils/securityAlert', () => ({ sendSecurityAlert: jest.fn().mockResolvedValue(undefined) }));

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
    (tokenStore.isAccountLocked as jest.Mock).mockResolvedValue(false);
    (tokenStore.getIpAttempts as jest.Mock).mockResolvedValue(0);
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
      (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 1, ipAttempts: 1 });
      await expect(authService.login({ email: 'test@example.com', password: 'wrong' }))
        .rejects.toThrow('Invalid email or password');
    });

    it('should throw for non-existent user', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 1, ipAttempts: 1 });
      await expect(authService.login({ email: 'nobody@example.com', password: 'password123' }))
        .rejects.toThrow('Invalid email or password');
    });

    it('should throw for deactivated account', async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });
      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Account is deactivated');
    });

    it('should throw when account is locked', async () => {
      (tokenStore.isAccountLocked as jest.Mock).mockResolvedValue(true);
      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Account temporarily locked');
    });

    it('should throw when IP is rate limited', async () => {
      (tokenStore.getIpAttempts as jest.Mock).mockResolvedValue(50);
      await expect(authService.login({ email: 'test@example.com', password: 'password123' }))
        .rejects.toThrow('Too many requests from this network');
    });
  });

  describe('forgotPassword', () => {
    it('creates a reset token for an existing, active user', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
      const createSpy = jest.spyOn(prisma.passwordResetToken, 'create').mockResolvedValue({} as any);

      await authService.forgotPassword('test@example.com');

      expect(createSpy).toHaveBeenCalledTimes(1);
      const callArg = createSpy.mock.calls[0][0] as any;
      expect(callArg.data.userId).toBe(mockUser.id);
      expect(typeof callArg.data.token).toBe('string');
      expect(callArg.data.token.length).toBeGreaterThan(0);
    });

    it('sets an expiry roughly 1 hour in the future', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
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
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      const createSpy = jest.spyOn(prisma.passwordResetToken, 'create');

      await expect(authService.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('silently does nothing for a deactivated account (no enumeration)', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ ...mockUser, isActive: false } as any);
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
        token: 'valid-token', userId: mockUser.id, expiresAt: futureDate(), used: false,
        user: mockUser,
      } as any);
      const transactionSpy = jest.spyOn(prisma, '$transaction').mockResolvedValue([{}, {}] as any);
      (tokenStore.deleteAllRefreshTokens as jest.Mock).mockResolvedValue(undefined);

      await authService.resetPassword('valid-token', 'newPassword123');

      expect(transactionSpy).toHaveBeenCalledTimes(1);
      expect(tokenStore.deleteAllRefreshTokens).toHaveBeenCalledWith(mockUser.id);
    });

    it('rejects an unknown token', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(null);

      await expect(authService.resetPassword('bad-token', 'newPassword123'))
        .rejects.toThrow('Password reset link is invalid or has expired');
    });

    it('rejects an expired token', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        token: 'expired-token', userId: mockUser.id, expiresAt: pastDate(), used: false,
        user: mockUser,
      } as any);

      await expect(authService.resetPassword('expired-token', 'newPassword123'))
        .rejects.toThrow('Password reset link is invalid or has expired');
    });

    it('rejects an already-used token (prevents replay)', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue({
        token: 'used-token', userId: mockUser.id, expiresAt: futureDate(), used: true,
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
