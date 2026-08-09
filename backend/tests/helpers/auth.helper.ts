import { hashPassword } from '../../src/shared/utils/hash';
import { signTokenPair } from '../../src/shared/utils/jwt';
import { prisma } from '../../src/config/prisma';
import { userCache } from '../../src/shared/utils/userCache';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export const createTestUser = async (overrides?: {
  email?: string;
  name?: string;
  // Gap #20 (admin permission tiers): MODERATOR/SUPER_ADMIN added
  // alongside USER/ADMIN — kept in sync with the Prisma Role enum.
  role?: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
}): Promise<TestUser> => {
  const passwordHash = await hashPassword('password123');
  const user = await prisma.user.create({
    data: {
      name: overrides?.name ?? 'Test User',
      email: overrides?.email ?? `test-${Date.now()}-${Math.random()}@example.com`,
      passwordHash,
      role: overrides?.role ?? 'USER',
    },
  });

  const tokens = signTokenPair(user.id);
  await userCache.set({ id: user.id, role: user.role, isActive: user.isActive });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
  };
};

export const createTestAdmin = async (): Promise<TestUser> =>
  createTestUser({ email: `admin-${Date.now()}@example.com`, role: 'ADMIN' });

// Gap #20 (admin permission tiers)
export const createTestModerator = async (): Promise<TestUser> =>
  createTestUser({ email: `mod-${Date.now()}@example.com`, role: 'MODERATOR' });

export const createTestSuperAdmin = async (): Promise<TestUser> =>
  createTestUser({ email: `super-${Date.now()}@example.com`, role: 'SUPER_ADMIN' });

// T-02: was missing from original — used by ads.test.ts
// Returns the access token for a given user (creates token directly, no HTTP round-trip)
export const getAuthToken = async (email: string): Promise<string> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Test user not found: ${email}`);
  const tokens = signTokenPair(user.id);
  return tokens.accessToken;
};
