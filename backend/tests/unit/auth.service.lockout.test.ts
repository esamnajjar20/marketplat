import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { hashPassword } from '../../src/shared/utils/hash';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { userCache } from '../../src/shared/utils/userCache';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { TooManyRequestsError } from '../../src/shared/errors/TooManyRequestsError';

jest.mock('../../src/modules/auth/auth.repository');
jest.mock('../../src/shared/utils/tokenStore');
jest.mock('../../src/shared/utils/userCache');
jest.mock('../../src/shared/utils/auditLog', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  AuditEvent: { LOGIN_FAILED: 'LOGIN_FAILED', LOGIN_SUCCESS: 'LOGIN_SUCCESS' },
}));
jest.mock('../../src/shared/utils/securityAlert', () => ({
  sendSecurityAlert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: '',
  role: 'USER' as const,
  phone: null,
  city: null,
  bio: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService.login — account-lockout branches', () => {
  beforeAll(async () => {
    mockUser.passwordHash = await hashPassword('password123');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStore.isAccountLocked as jest.Mock).mockResolvedValue(false);
    (tokenStore.getIpAttempts as jest.Mock).mockResolvedValue(0);
    (tokenStore.clearFailedLogins as jest.Mock).mockResolvedValue(undefined);
    (tokenStore.saveRefreshToken as jest.Mock).mockResolvedValue(undefined);
    (userCache.set as jest.Mock).mockResolvedValue(undefined);
    (userCache.invalidate as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('locks the account after the 5th failed attempt against a non-existent user', async () => {
    (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
    (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 5 });
    (tokenStore.lockAccount as jest.Mock).mockResolvedValue(undefined);

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'whatever' }, '1.2.3.4', 'ua')
    ).rejects.toThrow('Invalid email or password');

    expect(tokenStore.lockAccount).toHaveBeenCalledWith('nobody@example.com', 30 * 60);
  });

  it('does not lock the account below the 5th failed attempt against a non-existent user', async () => {
    (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
    (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 3 });

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'whatever' }, '1.2.3.4', 'ua')
    ).rejects.toThrow(UnauthorizedError);

    expect(tokenStore.lockAccount).not.toHaveBeenCalled();
  });

  it('locks the account and sends a security alert after the 5th wrong-password attempt', async () => {
    (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 5 });
    (tokenStore.lockAccount as jest.Mock).mockResolvedValue(undefined);
    const { sendSecurityAlert } = require('../../src/shared/utils/securityAlert');

    await expect(
      authService.login({ email: mockUser.email, password: 'wrong-password' }, '1.2.3.4', 'ua')
    ).rejects.toThrow(TooManyRequestsError);

    expect(tokenStore.lockAccount).toHaveBeenCalledWith(mockUser.email, 30 * 60);
    expect(sendSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: mockUser.id, event: 'ACCOUNT_LOCKED' })
    );
  });

  it('does not lock the account below the 5th wrong-password attempt', async () => {
    (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 2 });

    await expect(
      authService.login({ email: mockUser.email, password: 'wrong-password' }, '1.2.3.4', 'ua')
    ).rejects.toThrow(UnauthorizedError);

    expect(tokenStore.lockAccount).not.toHaveBeenCalled();
  });

  it('clears failed-login counters on a successful login', async () => {
    (authRepository.findByEmail as jest.Mock).mockResolvedValue(mockUser);

    await authService.login({ email: mockUser.email, password: 'password123' }, '1.2.3.4', 'ua');

    expect(tokenStore.clearFailedLogins).toHaveBeenCalledWith(mockUser.email, '1.2.3.4');
  });
});
