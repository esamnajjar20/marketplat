import { usersRepository } from '../../src/modules/users/users.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
  },
}));

const userId = 'user-1';

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  city: true,
  bio: true,
  avatarUrl: true,
  isActive: true,
  notificationPreferences: true,
  createdAt: true,
  updatedAt: true,
};

describe('usersRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findById', () => {
    it('queries by id with the safe (non-PII-excluding) select shape', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await usersRepository.findById(userId);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: safeUserSelect,
      });
    });

    it('returns null when no user matches', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await usersRepository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findPublicById', () => {
    it('queries by id with only the public-safe fields plus isActive', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await usersRepository.findPublicById(userId);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { id: true, name: true, city: true, bio: true, avatarUrl: true, createdAt: true, isActive: true },
      });
    });

    it('never requests email/phone/role in its select (PII leak guard)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await usersRepository.findPublicById(userId);
      const callArgs = (prisma.user.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('email');
      expect(callArgs.select).not.toHaveProperty('phone');
      expect(callArgs.select).not.toHaveProperty('role');
      expect(callArgs.select).not.toHaveProperty('updatedAt');
    });
  });

  describe('findByPhone', () => {
    it('queries by phone with the safe select shape', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await usersRepository.findByPhone('+966501234567');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '+966501234567' },
        select: safeUserSelect,
      });
    });
  });

  describe('update', () => {
    it('updates with the given partial data and returns the safe select shape', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId, name: 'New Name' });
      await usersRepository.update(userId, { name: 'New Name' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'New Name' },
        select: safeUserSelect,
      });
    });

    it('allows writing avatarUrl even though it is outside the public input type', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId });
      await usersRepository.update(userId, { avatarUrl: 'https://example.com/a.jpg' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { avatarUrl: 'https://example.com/a.jpg' },
        select: safeUserSelect,
      });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('merges the patch via a raw jsonb concatenation query, then re-fetches the user', async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(undefined);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: userId });

      const result = await usersRepository.updateNotificationPreferences(userId, { promotions: true });

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: safeUserSelect,
      });
      expect(result).toEqual({ id: userId });
    });

    it('throws when the user disappears between the raw update and the re-fetch', async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(undefined);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        usersRepository.updateNotificationPreferences(userId, { promotions: true })
      ).rejects.toThrow('User disappeared during notification preferences update');
    });
  });

  describe('deleteById', () => {
    it('soft-deletes by setting isActive to false', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId, isActive: false });
      await usersRepository.deleteById(userId);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isActive: false },
      });
    });
  });
});
