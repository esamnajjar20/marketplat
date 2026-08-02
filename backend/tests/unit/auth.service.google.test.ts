import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { tokenStore } from '../../src/shared/utils/tokenStore';
import { userCache } from '../../src/shared/utils/userCache';
import { auditLog, AuditEvent } from '../../src/shared/utils/auditLog';

jest.mock('../../src/modules/auth/auth.repository');
jest.mock('../../src/shared/utils/tokenStore');
jest.mock('../../src/shared/utils/userCache');
jest.mock('../../src/shared/utils/auditLog', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  AuditEvent: {
    OAUTH_LOGIN: 'OAUTH_LOGIN',
    OAUTH_ACCOUNT_LINKED: 'OAUTH_ACCOUNT_LINKED',
    OAUTH_SIGNUP: 'OAUTH_SIGNUP',
  },
}));
jest.mock('../../src/shared/utils/securityAlert', () => ({ sendSecurityAlert: jest.fn().mockResolvedValue(undefined) }));

const baseUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: null as string | null,
  provider: 'local',
  googleId: null as string | null,
  role: 'USER' as const,
  phone: null,
  city: null,
  bio: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const googleProfile = {
  googleId: 'google-abc-123',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
};

describe('AuthService.login — regression for OAuth-only accounts (passwordHash now nullable)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStore.isAccountLocked as jest.Mock).mockResolvedValue(false);
    (tokenStore.getIpAttempts as jest.Mock).mockResolvedValue(0);
    (tokenStore.incrementFailedLogins as jest.Mock).mockResolvedValue({ emailAttempts: 1, ipAttempts: 1 });
    (tokenStore.clearFailedLogins as jest.Mock).mockResolvedValue(undefined);
    (tokenStore.lockAccount as jest.Mock).mockResolvedValue(undefined);
  });

  it('rejects local email/password login for a Google-only account (no passwordHash) with the same generic invalid-credentials error', async () => {
    const oauthOnlyUser = { ...baseUser, provider: 'google', googleId: 'google-abc-123', passwordHash: null };
    (authRepository.findByEmail as jest.Mock).mockResolvedValue(oauthOnlyUser);

    await expect(
      authService.login({ email: 'test@example.com', password: 'anything' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // Same failed-login counting as a wrong password for a normal
    // account — doesn't leak "this account has no password" as a
    // distinct signal to an unauthenticated caller.
    expect(tokenStore.incrementFailedLogins).toHaveBeenCalledWith('test@example.com', 'unknown');
  });
});

describe('AuthService.loginWithGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStore.saveRefreshToken as jest.Mock).mockResolvedValue(undefined);
    (userCache.set as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('case 1 — existing googleId (plain login)', () => {
    it('logs in and reuses issueSession without creating or linking anything', async () => {
      const existing = { ...baseUser, provider: 'google', googleId: googleProfile.googleId };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(existing);

      const result = await authService.loginWithGoogle(googleProfile, '1.2.3.4', 'jest-agent');

      expect(authRepository.findByGoogleId).toHaveBeenCalledWith(googleProfile.googleId);
      expect(authRepository.findByEmail).not.toHaveBeenCalled();
      expect(authRepository.createWithGoogle).not.toHaveBeenCalled();
      expect(authRepository.linkGoogleAccount).not.toHaveBeenCalled();

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(tokenStore.saveRefreshToken).toHaveBeenCalledWith(
        existing.id,
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ rawIp: '1.2.3.4', userAgent: 'jest-agent' })
      );
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ event: AuditEvent.OAUTH_LOGIN, userId: existing.id }));
    });

    it('rejects login for a deactivated account', async () => {
      const existing = { ...baseUser, provider: 'google', googleId: googleProfile.googleId, isActive: false };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(existing);

      await expect(authService.loginWithGoogle(googleProfile)).rejects.toMatchObject({
        code: 'ACCOUNT_DEACTIVATED',
      });
    });
  });

  describe('case 2 — existing email, no googleId (account linking)', () => {
    it('links the Google account to the existing local user instead of creating a duplicate', async () => {
      const existingLocal = { ...baseUser, provider: 'local', googleId: null, passwordHash: 'hashed' };
      const linked = { ...existingLocal, provider: 'google', googleId: googleProfile.googleId };

      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(existingLocal);
      (authRepository.linkGoogleAccount as jest.Mock).mockResolvedValue(linked);

      const result = await authService.loginWithGoogle(googleProfile);

      expect(authRepository.findByEmail).toHaveBeenCalledWith(googleProfile.email);
      expect(authRepository.linkGoogleAccount).toHaveBeenCalledWith(existingLocal.id, googleProfile.googleId);
      expect(authRepository.createWithGoogle).not.toHaveBeenCalled();

      expect(result.user.email).toBe('test@example.com');
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.OAUTH_ACCOUNT_LINKED, userId: linked.id })
      );
    });

    it('never creates a second user for an email that already exists', async () => {
      const existingLocal = { ...baseUser, provider: 'local', googleId: null, passwordHash: 'hashed' };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(existingLocal);
      (authRepository.linkGoogleAccount as jest.Mock).mockResolvedValue({
        ...existingLocal,
        provider: 'google',
        googleId: googleProfile.googleId,
      });

      await authService.loginWithGoogle(googleProfile);

      expect(authRepository.createWithGoogle).not.toHaveBeenCalled();
    });

    it('does not touch the existing user password when linking', async () => {
      const existingLocal = { ...baseUser, provider: 'local', googleId: null, passwordHash: 'existing-hash' };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(existingLocal);
      (authRepository.linkGoogleAccount as jest.Mock).mockResolvedValue({
        ...existingLocal,
        provider: 'google',
        googleId: googleProfile.googleId,
      });

      await authService.loginWithGoogle(googleProfile);

      // linkGoogleAccount is called with only (userId, googleId) — the
      // repository method itself (auth.repository.ts) never includes
      // passwordHash in its update payload; this assertion pins that
      // call shape so a future change can't silently start touching it.
      expect(authRepository.linkGoogleAccount).toHaveBeenCalledWith(existingLocal.id, googleProfile.googleId);
    });

    it('rejects linking for a deactivated existing account', async () => {
      const existingLocal = { ...baseUser, provider: 'local', googleId: null, isActive: false };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(existingLocal);

      await expect(authService.loginWithGoogle(googleProfile)).rejects.toMatchObject({
        code: 'ACCOUNT_DEACTIVATED',
      });
      expect(authRepository.linkGoogleAccount).not.toHaveBeenCalled();
    });
  });

  describe('case 3 — brand-new user', () => {
    it('creates a new user with provider=google and no SellerProfile side effect', async () => {
      const created = {
        ...baseUser,
        id: 'new-user-1',
        provider: 'google',
        googleId: googleProfile.googleId,
        passwordHash: null,
      };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.createWithGoogle as jest.Mock).mockResolvedValue(created);

      const result = await authService.loginWithGoogle(googleProfile);

      expect(authRepository.createWithGoogle).toHaveBeenCalledWith({
        name: googleProfile.name,
        email: googleProfile.email,
        googleId: googleProfile.googleId,
        avatarUrl: googleProfile.avatarUrl,
      });
      expect(authRepository.linkGoogleAccount).not.toHaveBeenCalled();
      expect(result.user.id).toBe('new-user-1');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ event: AuditEvent.OAUTH_SIGNUP, userId: 'new-user-1' }));

      // FIX OAUTH-01 requirement: Google signup never creates a
      // SellerProfile — that stays an explicit opt-in via a separate
      // POST /sellers call regardless of auth provider. This test
      // module never imports or mocks sellersService/prisma.sellerProfile
      // at all, so any code path that tried to create one here would
      // throw (undefined is not a function) rather than silently pass.
    });

    it('reuses the same issueSession token-issuing path as local login/register', async () => {
      const created = { ...baseUser, id: 'new-user-2', provider: 'google', googleId: googleProfile.googleId };
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (authRepository.createWithGoogle as jest.Mock).mockResolvedValue(created);

      const result = await authService.loginWithGoogle(googleProfile, '5.6.7.8', 'jest-agent-2');

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(tokenStore.saveRefreshToken).toHaveBeenCalledWith(
        'new-user-2',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ rawIp: '5.6.7.8', userAgent: 'jest-agent-2' })
      );
      expect(userCache.set).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user-2' }));
    });
  });

  describe('concurrent resolution for the same email', () => {
    it('serializes two concurrent Google logins for the same brand-new email so only one user is created', async () => {
      (authRepository.findByGoogleId as jest.Mock).mockResolvedValue(null);
      (authRepository.findByEmail as jest.Mock).mockResolvedValue(null);

      let createCalls = 0;
      (authRepository.createWithGoogle as jest.Mock).mockImplementation(async () => {
        createCalls += 1;
        // Simulate real DB latency so a second call, if not locked out,
        // would start before the first one commits.
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ...baseUser, id: `new-user-${createCalls}`, provider: 'google', googleId: googleProfile.googleId };
      });

      const [first, second] = await Promise.allSettled([
        authService.loginWithGoogle(googleProfile),
        authService.loginWithGoogle(googleProfile),
      ]);

      // Exactly one of the two succeeds; the other is rejected by the
      // oauthLock (ConflictError) rather than both racing through to a
      // duplicate authRepository.createWithGoogle call.
      const settledStatuses = [first.status, second.status].sort();
      expect(settledStatuses).toEqual(['fulfilled', 'rejected']);
      expect(createCalls).toBe(1);
    });
  });
});
