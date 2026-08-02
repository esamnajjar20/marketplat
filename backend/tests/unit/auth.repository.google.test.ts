import { authRepository } from '../../src/modules/auth/auth.repository';
import { prisma } from '../../src/config/prisma';
import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('authRepository — Google OAuth methods', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findByGoogleId', () => {
    it('queries by googleId', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await authRepository.findByGoogleId('google-abc-123');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { googleId: 'google-abc-123' } });
    });

    it('returns null when no user has that googleId', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await authRepository.findByGoogleId('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the matched user', async () => {
      const user = { id: 'user-1', googleId: 'google-abc-123' };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
      const result = await authRepository.findByGoogleId('google-abc-123');
      expect(result).toEqual(user);
    });
  });

  describe('createWithGoogle', () => {
    const googleData = {
      name: 'Test User',
      email: 'test@example.com',
      googleId: 'google-abc-123',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    it('creates a user with provider=google and no passwordHash field set', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'new-user-1', ...googleData, provider: 'google' });

      await authRepository.createWithGoogle(googleData);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: googleData.name,
          email: googleData.email,
          googleId: googleData.googleId,
          avatarUrl: googleData.avatarUrl,
          provider: 'google',
        },
      });
      // Confirms passwordHash is never part of the create payload for
      // an OAuth-only signup — Prisma will apply the column's own
      // nullable default rather than this repository method setting it.
      const createArg = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data).not.toHaveProperty('passwordHash');
    });

    it('propagates a P2002 unique constraint violation (e.g. email/googleId race) via handlePrismaError', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['email'] },
      });
      (prisma.user.create as jest.Mock).mockRejectedValue(prismaError);

      await expect(authRepository.createWithGoogle(googleData)).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe('linkGoogleAccount', () => {
    it('updates only googleId and provider, leaving passwordHash untouched', async () => {
      const linked = { id: 'user-1', googleId: 'google-abc-123', provider: 'google' };
      (prisma.user.update as jest.Mock).mockResolvedValue(linked);

      const result = await authRepository.linkGoogleAccount('user-1', 'google-abc-123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { googleId: 'google-abc-123', provider: 'google' },
      });
      const updateArg = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('passwordHash');
      expect(result).toEqual(linked);
    });

    it('propagates prisma errors via handlePrismaError', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['googleId'] },
      });
      (prisma.user.update as jest.Mock).mockRejectedValue(prismaError);

      await expect(authRepository.linkGoogleAccount('user-1', 'google-abc-123')).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
